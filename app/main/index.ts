import path from "node:path";

import { chromeInsets } from "../core/engines/chrome.ts";
import { isSignIn } from "../core/engines/links.ts";
import { ENTITLEMENT_URL } from "../core/entitlement/api.ts";
import { acceptedKeys, importKeys } from "../core/entitlement/keys.ts";
import { AppEvents } from "../core/events.ts";
import { themeOf } from "../core/ports.ts";
import { allowlist } from "../shared/channels/define.ts";
import { surfaces } from "../shared/channels/surfaces.ts";
import type { OverlayKind } from "../shared/channels/surfaces.ts";
import { themePushes } from "../shared/channels/theme.ts";
import { commands as allCommands } from "../shared/commands/registry.ts";
import { Entitlement } from "./features/entitlement/index.ts";
import { Launcher } from "./features/launcher/index.ts";
import { Links } from "./features/links/index.ts";
import { Profiles } from "./features/profiles/index.ts";
import { SettingsStore } from "./features/settings/index.ts";
import { SettingsWindow } from "./features/settings/window.ts";
import { Sidebars } from "./features/sidebar/index.ts";
import { Stages } from "./features/stage/index.ts";
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
import { exposeE2e, RecordingShell } from "./shell/e2e.ts";
import { IpcDispatcher } from "./shell/ipc.ts";
import { ShortcutKeys } from "./shell/keys.ts";
import { exposeMeasure } from "./shell/measure.ts";
import { ApplicationMenu } from "./shell/menu.ts";
import { MainWindow, pageUrl } from "./shell/window.ts";
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
  const lists = surfaces.map(allowlist);
  listenIpc(
    {
      event: lists.flatMap((list) => [...list.event]),
      invoke: lists.flatMap((list) => [...list.invoke]),
      sync: lists.flatMap((list) => [...list.sync]),
    },
    (contentsId, channel, payload) => {
      const result = dispatcher.dispatch(contentsId, channel, payload);
      if (!result.ok) {
        ipcLog.warn("A request was refused", {
          channel,
          kind: result.error.kind,
          message: result.error.message,
        });
      }
      return result;
    }
  );

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
    entitlement: entitlement.current(),
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
  const pages: PageOptions = {
    devServer: process.env.MERU_RENDERER_URL,
    dir: path.join(dist, "renderer"),
    platform: ports.lifecycle.platform,
    theme: () => themeOf(ports.theme),
  };
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
    onOpen: (tabId, url, disposition) => links.open(tabId, url, disposition),
    onPopup: (url) => {
      const shows = isSignIn(url);
      if (!shows) {
        shell.openExternal(url);
      }
      return shows;
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
      const accent = profiles.state.profiles.find(
        (profile) => profile.id === tab.profileId
      )?.color;
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
  const links = new Links({
    profiles,
    settings,
    shell,
    stages,
  });
  new Launcher({
    commands,
    events,
    overlayUrl,
    registrar: dispatcher,
    stages,
  }).start();

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
  ports.theme.onChange(() => {
    const theme = themeOf(ports.theme);
    window.recolour(theme);
    settingsWindow.recolour(theme);
    dispatcher.broadcast(themePushes.changed, { theme });
  });
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
