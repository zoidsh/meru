import path from "node:path";

import { chromeInsets } from "../core/engines/chrome.ts";
import { GMAIL_URL } from "../core/engines/inbox.ts";
import { ENTITLEMENT_URL } from "../core/entitlement/api.ts";
import { acceptedKeys, importKeys } from "../core/entitlement/keys.ts";
import { AppEvents } from "../core/events.ts";
import { themeOf } from "../core/ports.ts";
import { platformOf } from "../core/records/platform.ts";
import { allowlist } from "../shared/channels/define.ts";
import { surfaces } from "../shared/channels/surfaces.ts";
import type { OverlayKind } from "../shared/channels/surfaces.ts";
import { commands as allCommands } from "../shared/commands/registry.ts";
import { Appearance } from "./features/appearance/index.ts";
import { Badge } from "./features/badge/index.ts";
import { Entitlement } from "./features/entitlement/index.ts";
import { Inbox } from "./features/inbox/index.ts";
import { Launcher } from "./features/launcher/index.ts";
import { Links } from "./features/links/index.ts";
import { Notifications } from "./features/notifications/index.ts";
import { Profiles } from "./features/profiles/index.ts";
import { SettingsStore } from "./features/settings/index.ts";
import { SettingsWindow } from "./features/settings/window.ts";
import { Sidebars } from "./features/sidebar/index.ts";
import { Sleep } from "./features/sleep/index.ts";
import { Stages } from "./features/stage/index.ts";
import { Tray } from "./features/tray/index.ts";
import { Updater } from "./features/updater/index.ts";
import { Windows } from "./features/windows/index.ts";
import { listenIpc } from "./platform/ipc.ts";
import { createFileLog } from "./platform/log.ts";
import type { FileLog } from "./platform/log.ts";
import {
  applicationAccelerators,
  setApplicationMenu,
} from "./platform/menu.ts";
import {
  createElectronEntitlementApi,
  createElectronPorts,
} from "./platform/ports.ts";
import { createElectronUpdater } from "./platform/updater.ts";
import { placeUserData, userDataDir } from "./platform/user-data.ts";
import { CommandDispatcher } from "./shell/commands.ts";
import { exposeE2e, recordingDesktop, RecordingShell } from "./shell/e2e.ts";
import { logFailures } from "./shell/failures.ts";
import { IpcDispatcher } from "./shell/ipc.ts";
import { ShortcutKeys } from "./shell/keys.ts";
import { exposeMeasure } from "./shell/measure.ts";
import { ApplicationMenu } from "./shell/menu.ts";
import { isPageUrl, MainWindow, pageUrl } from "./shell/window.ts";
import type { PageOptions } from "./shell/window.ts";

// Held outside start() so a failure to start can still be written and the file flushed.
let fileLog: FileLog | undefined;

const start = async () => {
  const dist = path.join(import.meta.dirname, "..");
  placeUserData(path.join(dist, "..", ".."));
  const ports = createElectronPorts();
  const log = createFileLog({
    directory: path.join(userDataDir(), "logs"),
    minimum: ports.lifecycle.packaged ? "info" : "debug",
    mirror: !ports.lifecycle.packaged,
  });
  fileLog = log;
  const pages: PageOptions = {
    devServer: process.env.MERU_RENDERER_URL,
    dir: path.join(dist, "renderer"),
    platform: ports.lifecycle.platform,
    theme: () => themeOf(ports.theme),
  };
  logFailures({
    lifecycle: ports.lifecycle,
    log: log.scoped("app"),
    ownPage: (url) => isPageUrl(pages, url),
  });
  ports.lifecycle.onQuit(async () => {
    await log.flush();
  });
  // An installed app never takes the test switches from its environment, so no user can turn on the inspector or blank panes by setting a variable.
  const e2e = !ports.lifecycle.packaged && process.env.MERU_E2E === "1";
  const measure = !ports.lifecycle.packaged && process.env.MERU_MEASURE === "1";

  ports.lifecycle.onWindowAllClosed(() => {
    ports.lifecycle.quit();
  });
  await ports.lifecycle.whenReady();
  if (process.env.MERU_TEST_BACKGROUND === "1") {
    ports.lifecycle.prohibitActivation();
  }

  const ipcLog = log.scoped("ipc");
  const dispatcher = new IpcDispatcher({
    log: ipcLog,
    transport: ports.ipc,
  });
  listenIpc(allowlist(...surfaces), (contentsId, channel, payload) => {
    const result = dispatcher.dispatch(contentsId, channel, payload);
    if (!result.ok) {
      ipcLog.warn("A request was refused", {
        channel,
        kind: result.error.kind,
        detail: result.error.message,
      });
    }
    return result;
  });

  const events = new AppEvents();
  const entitlement = new Entitlement({
    api: createElectronEntitlementApi(
      process.env.MERU_ENTITLEMENT_URL ?? ENTITLEMENT_URL
    ),
    lifecycle: ports.lifecycle,
    clock: ports.clock,
    events,
    fs: ports.fs,
    ids: ports.ids,
    keys: await importKeys(
      crypto.subtle,
      acceptedKeys(ports.lifecycle.packaged)
    ),
    online: ports.online,
    power: ports.power,
    log: log.scoped("entitlement"),
    registrar: dispatcher,
    subtle: crypto.subtle,
  });
  await entitlement.open();
  entitlement.attach();

  const settings = new SettingsStore({
    lifecycle: ports.lifecycle,
    clock: ports.clock,
    fs: ports.fs,
    log: log.scoped("settings"),
    registrar: dispatcher,
    // Only a run from the repository follows hand edits; an installed app learns of a change from the code that made it.
    watchFile: !ports.lifecycle.packaged,
    entitlement: () => entitlement.current(),
    events,
  });
  await settings.open();
  settings.start();

  const commands = new CommandDispatcher();
  commands.start(dispatcher);

  const profiles = new Profiles({
    commands,
    lifecycle: ports.lifecycle,
    clock: ports.clock,
    entitlement: () => entitlement.current(),
    events,
    fs: ports.fs,
    ids: ports.ids,
    log: log.scoped("profiles"),
    registrar: dispatcher,
    sessions: ports.sessions,
    settings,
  });
  await profiles.open();
  profiles.start();

  const windows = new Windows({
    lifecycle: ports.lifecycle,
    clock: ports.clock,
    displays: ports.displays,
    events,
    fs: ports.fs,
    ids: ports.ids,
    log: log.scoped("windows"),
    profiles,
  });
  await windows.open();
  windows.start();

  const keys = new ShortcutKeys({
    commands: allCommands,
    dispatcher: commands,
    platform: ports.lifecycle.platform,
    log: log.scoped("keys"),
    settings,
  });
  keys.start();

  const sidebars = new Sidebars({
    commands,
    events,
    profiles,
    registrar: dispatcher,
    settings,
  });
  sidebars.start();

  // The suite asserts on what the app would put on the desktop and puts nothing there.
  const recorded = recordingDesktop();
  const desktop = e2e ? recorded : ports;
  // A run from the repository can read a stand-in feed; the suite and a measure read none unless given one, so no test run asks Google.
  const gmailOverride = ports.lifecycle.packaged
    ? undefined
    : process.env.MERU_GMAIL_URL;
  const inbox = new Inbox({
    clock: ports.clock,
    events,
    gmailUrl: gmailOverride ?? GMAIL_URL,
    log: log.scoped("inbox"),
    online: ports.online,
    power: ports.power,
    profiles,
    sessions: ports.sessions,
    settings,
  });
  new Badge({ badge: desktop.badge, events, inbox, settings }).start();
  if (gmailOverride !== undefined || !(e2e || measure)) {
    inbox.start();
  }
  const overlayUrl = (
    kind: OverlayKind,
    query: Readonly<Record<string, string>>
  ): string => pageUrl(pages, "overlay.html", { ...query, kind });
  // The end-to-end suite asserts on the links that would leave for the browser and never opens one.
  const externalLinks = new RecordingShell();
  const shell = e2e ? externalLinks : ports.shell;
  const stages = new Stages({
    blankPanes: e2e,
    commands,
    historyOf: (tabId) => sleep.historyOf(tabId),
    onOpen: (tabId, url, disposition) => links.open(tabId, url, disposition),
    onPopup: (url) => links.popup(url),
    onSplitRequested: (windowId, orientation) => {
      launcher.open(windowId, orientation);
    },
    dragPreload: path.join(dist, "preload", "drag.cjs"),
    overlayPreload: path.join(dist, "preload", "renderer.cjs"),
    events,
    insets: () => chromeInsets(sidebars.current()),
    log: log.scoped("stage"),
    profiles,
    registrar: dispatcher,
    settings,
    keys,
    // The chrome is neutral grey, so the drop takes the colour that marks the tab's profile, which stands out on a page.
    tabDragUrl: (tab) => {
      const accent = profiles.profile(tab.profileId)?.color;
      return overlayUrl("tabDrag", {
        appId: tab.appId,
        tabId: tab.id,
        ...(accent === undefined ? {} : { accent }),
        ...(tab.title === null ? {} : { title: tab.title }),
      });
    },
    views: ports.views,
  });
  stages.start();
  // The end-to-end suite shortens a minute of `sleep.afterMinutes` to watch a tab fall asleep.
  const sleepMinute = Number(process.env.MERU_SLEEP_MINUTE);
  const sleep = new Sleep({
    clock: ports.clock,
    commands,
    events,
    ...(ports.lifecycle.packaged || !(sleepMinute > 0)
      ? {}
      : { minute: sleepMinute }),
    profiles,
    settings,
    stages,
  });
  sleep.start();
  const links = new Links({
    log: log.scoped("links"),
    profiles,
    settings,
    shell,
    stages,
  });
  const launcher = new Launcher({
    commands,
    overlayUrl,
    registrar: dispatcher,
    stages,
  });
  launcher.start();

  const updater = new Updater({
    lifecycle: ports.lifecycle,
    clock: ports.clock,
    commands,
    events,
    log: log.scoped("updater"),
    registrar: dispatcher,
    settings,
    updater: createElectronUpdater(),
  });
  updater.attach();

  new ApplicationMenu({
    apply: setApplicationMenu,
    commands: allCommands,
    dispatcher: commands,
    events,
    platform: ports.lifecycle.platform,
    log: log.scoped("menu"),
    settings,
  }).start();

  if (measure) {
    exposeMeasure({ stages });
  }
  if (e2e) {
    exposeE2e({
      accelerators: applicationAccelerators,
      desktop: recorded,
      external: externalLinks,
      stages,
    });
  }

  const background = process.env.MERU_BACKGROUND === "1";
  const linuxControls = settings.get("window.linuxControls");
  const settingsWindow = new SettingsWindow({
    background,
    commands,
    linuxControls,
    log: log.scoped("settings"),
    ports,
    preload: path.join(dist, "preload", "renderer.cjs"),
    registrar: dispatcher,
    url: () => pageUrl(pages, "settings.html"),
  });
  settingsWindow.start();

  const window = new MainWindow({
    background,
    bounds: windows.mainBounds(),
    linuxControls,
    onCreated: (created) => {
      keys.attach(created, created.contentsId);
      windows.attachMain(created);
      stages.open(created, () => windows.mainGroupId());
    },
    ports,
    pages,
    preload: path.join(dist, "preload", "renderer.cjs"),
    registrar: dispatcher,
    surface: "chrome",
  });
  new Appearance({
    registrar: dispatcher,
    theme: ports.theme,
    windows: [window, settingsWindow],
  }).start();
  const platform = platformOf(ports.lifecycle.platform);
  new Notifications({
    events,
    inbox,
    gmailUrl: gmailOverride ?? GMAIL_URL,
    load: (tabId, url) => {
      stages.load(tabId, url);
    },
    notifications: desktop.notifications,
    platform,
    profiles,
    settings,
    showWindow: () => {
      window.reveal();
    },
  }).start();
  new Tray({
    events,
    inbox,
    platform,
    profiles,
    settings,
    theme: ports.theme,
    tray: desktop.tray,
    window,
  }).start();
  await window.show();
  entitlement.start();
  updater.start();
};

// Not awaited: Electron holds back "ready" until an ES module entry finishes evaluating, so a top-level await on whenReady() never settles.
const main = async () => {
  try {
    await start();
  } catch (error) {
    // The log may not exist yet, and a start that got nowhere leaves nothing else to read.
    console.error(error);
    fileLog?.scoped("main").error("The app could not start", { error });
    await fileLog?.flush();
    process.exit(1);
  }
};

void main();
