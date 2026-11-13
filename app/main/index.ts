import path from "node:path";

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
import { Profiles } from "./features/profiles/index.ts";
import { SettingsStore } from "./features/settings/index.ts";
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
import { answerMeasure } from "./shell/measure.ts";
import { ApplicationMenu } from "./shell/menu.ts";
import { MainWindow } from "./shell/window.ts";

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

  const profiles = new Profiles({
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

  const commands = new CommandDispatcher();
  commands.start(dispatcher);

  const stages = new Stages({
    blankPanes: e2e,
    commands,
    dragPreload: path.join(dist, "preload", "drag.cjs"),
    events,
    onError: report,
    profiles,
    registrar: dispatcher,
    settings,
    views: ports.views,
  });
  stages.start();

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
    onCreated: (created) => {
      dispatcher.assign(created.contentsId, pageSurface);
      windows.attachMain(created);
      stages.open(created, () => windows.mainGroupId());
    },
    ports,
    preload: path.join(dist, "preload", "renderer.cjs"),
    rendererFile: path.join(dist, "renderer", "chrome.html"),
    rendererUrl: process.env.MERU_RENDERER_URL,
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
