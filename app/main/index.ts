import path from "node:path";

import { TITLEBAR_HEIGHT } from "../core/engines/chrome.ts";
import { sidebarInset } from "../core/engines/sidebar.ts";
import { ENTITLEMENT_URL } from "../core/entitlement/api.ts";
import { acceptedKeys, importKeys } from "../core/entitlement/keys.ts";
import { AppEvents } from "../core/events.ts";
import { allowlist } from "../shared/channels/define.ts";
import {
  rendererSurface,
  surfaces,
  TEST_SURFACE_ARGUMENT,
  testSurface,
} from "../shared/channels/surfaces.ts";
import { commands as allCommands } from "../shared/commands/registry.ts";
import { Entitlement } from "./features/entitlement/index.ts";
import { Launcher } from "./features/launcher/index.ts";
import { Profiles } from "./features/profiles/index.ts";
import { SettingsStore } from "./features/settings/index.ts";
import { Sidebars } from "./features/sidebar/index.ts";
import { Stages } from "./features/stage/index.ts";
import { Updater } from "./features/updater/index.ts";
import { Windows } from "./features/windows/index.ts";
import { listenIpc } from "./platform/ipc.ts";
import {
  applicationAccelerators,
  setApplicationMenu,
} from "./platform/menu.ts";
import {
  createElectronEntitlementApi,
  createElectronPorts,
} from "./platform/ports.ts";
import { createElectronUpdater } from "./platform/updater.ts";
import { placeUserData } from "./platform/user-data.ts";
import { CommandDispatcher } from "./shell/commands.ts";
import { answerE2e } from "./shell/e2e.ts";
import { IpcDispatcher } from "./shell/ipc.ts";
import { ShortcutKeys } from "./shell/keys.ts";
import { answerMeasure } from "./shell/measure.ts";
import { ApplicationMenu } from "./shell/menu.ts";
import { MainWindow, pageUrl } from "./shell/window.ts";
import type { PageOptions } from "./shell/window.ts";

const report = (error: unknown) => {
  console.error(error);
};

const start = async () => {
  const dist = path.join(import.meta.dirname, "..");
  placeUserData(path.join(dist, "..", ".."));
  const ports = createElectronPorts();
  const e2e = process.env.MERU_E2E === "1";
  const measure = process.env.MERU_MEASURE === "1";
  const pageSurface = e2e || measure ? testSurface : rendererSurface;

  ports.lifecycle.onWindowAllClosed(() => {
    ports.lifecycle.quit();
  });
  await ports.lifecycle.whenReady();
  if (process.env.MERU_TEST_BACKGROUND === "1") {
    ports.lifecycle.prohibitActivation();
  }

  const dispatcher = new IpcDispatcher({
    onError: report,
    transport: ports.ipc,
  });
  const lists = [...surfaces, pageSurface].map(allowlist);
  listenIpc(
    {
      event: lists.flatMap((list) => [...list.event]),
      invoke: lists.flatMap((list) => [...list.invoke]),
      sync: lists.flatMap((list) => [...list.sync]),
    },
    (contentsId, channel, payload) => {
      const result = dispatcher.dispatch(contentsId, channel, payload);
      if (!result.ok) {
        console.warn(`${channel}: ${result.error.message}`);
      }
      return result;
    }
  );

  const settings = new SettingsStore({
    lifecycle: ports.lifecycle,
    clock: ports.clock,
    fs: ports.fs,
    onError: report,
    onFallback: (fallbacks) => {
      for (const { key, profileId, reason } of fallbacks) {
        console.warn(
          `settings.json: ${key ?? "a layer"}${profileId === null ? "" : ` of profile ${profileId}`} is ${reason}, so its default stands`
        );
      }
    },
    registrar: dispatcher,
    // Only a run from the repository follows hand edits; an installed app learns of a change from the code that made it.
    watchFile: !ports.lifecycle.packaged,
  });
  await settings.open();
  settings.start();

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
    onError: report,
    registrar: dispatcher,
    report: (message) => {
      console.warn(message);
    },
    subtle: crypto.subtle,
  });
  await entitlement.open();
  entitlement.attach();

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
    onError: report,
    registrar: dispatcher,
    report: (message) => {
      console.warn(message);
    },
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
    onError: report,
    profiles,
    report: (message) => {
      console.warn(message);
    },
  });
  await windows.open();
  windows.start();

  const keys = new ShortcutKeys({
    commands: allCommands,
    dispatcher: commands,
    platform: ports.lifecycle.platform,
    report: (message) => {
      console.warn(message);
    },
    settings,
  });
  keys.start();

  const stages = new Stages({
    blankPanes: e2e,
    commands,
    dragPreload: path.join(dist, "preload", "drag.cjs"),
    popupPreload: path.join(dist, "preload", "renderer.cjs"),
    events,
    insets: () => ({
      left: sidebarInset(sidebars.current()),
      top: TITLEBAR_HEIGHT,
    }),
    onError: report,
    profiles,
    registrar: dispatcher,
    settings,
    keys,
    views: ports.views,
  });
  stages.start();
  const sidebars = new Sidebars({
    commands,
    events,
    onChange: () => {
      stages.relayout();
    },
    profiles,
    registrar: dispatcher,
    settings,
  });
  sidebars.start();
  const pages: PageOptions = {
    devServer: process.env.MERU_RENDERER_URL,
    dir: path.join(dist, "renderer"),
    platform: ports.lifecycle.platform,
    theme: () => (ports.theme.dark() ? "dark" : "light"),
  };
  new Launcher({
    commands,
    pageUrl: (anchor) =>
      pageUrl(pages, "launcher.html", { anchor: JSON.stringify(anchor) }),
    registrar: dispatcher,
    stages,
  }).start();

  const updater = new Updater({
    lifecycle: ports.lifecycle,
    clock: ports.clock,
    commands,
    events,
    onError: report,
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
    report: (message) => {
      console.warn(message);
    },
    settings,
  }).start();

  if (measure) {
    answerMeasure({ registrar: dispatcher, stages });
  }
  if (e2e) {
    answerE2e({
      accelerators: applicationAccelerators,
      registrar: dispatcher,
      stages,
    });
  }

  const window = new MainWindow({
    arguments: pageSurface === testSurface ? [TEST_SURFACE_ARGUMENT] : [],
    background: process.env.MERU_BACKGROUND === "1",
    bounds: windows.mainBounds(),
    linuxControls: settings.get("window.linuxControls"),
    onCreated: (created) => {
      keys.attach(created, created.contentsId);
      dispatcher.assign(created.contentsId, pageSurface);
      windows.attachMain(created);
      stages.open(created, () => windows.mainGroupId());
    },
    ports,
    pages,
    preload: path.join(dist, "preload", "renderer.cjs"),
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
    console.error(error);
    process.exit(1);
  }
};

void main();
