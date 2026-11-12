import path from "node:path";

import { leaf } from "../core/engines/layout.ts";
import type { Group } from "../core/records/group.ts";
import type { Tab } from "../core/records/tab.ts";
import { allowlist } from "../shared/channels/define.ts";
import { rendererSurface, surfaces } from "../shared/channels/surfaces.ts";
import { SettingsStore } from "./features/settings/index.ts";
import { Stages } from "./features/stage/index.ts";
import { listenIpc } from "./platform/ipc.ts";
import { setApplicationMenu } from "./platform/menu.ts";
import { createElectronPorts } from "./platform/ports.ts";
import { IpcDispatcher } from "./shell/ipc.ts";
import { buildMenu } from "./shell/menu.ts";
import { MainWindow } from "./shell/window.ts";

const PROFILE_ID = "dev";

const report = (error: unknown) => {
  console.error(error);
};

const start = async () => {
  const ports = createElectronPorts();
  const dist = path.join(import.meta.dirname, "..");
  const e2e = process.env.MERU_E2E === "1";

  ports.app.onWindowAllClosed(() => {
    ports.app.quit();
  });
  await ports.app.whenReady();
  if (process.env.MERU_TEST_BACKGROUND === "1") {
    ports.app.prohibitActivation();
  }

  const dispatcher = new IpcDispatcher({
    onError: report,
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
        console.warn(`${channel}: ${result.error.message}`);
      }
      return result;
    }
  );

  const settings = new SettingsStore({
    app: ports.app,
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
    watchFile: !ports.app.packaged,
  });
  await settings.open();
  settings.start();

  const stages = new Stages({
    dragPreload: path.join(dist, "preload", "drag.cjs"),
    e2e,
    ids: ports.ids,
    onError: report,
    registrar: dispatcher,
    settings,
    views: ports.views,
  });
  stages.start();
  setApplicationMenu(
    buildMenu({
      onFailure: (action, error) => {
        console.warn(`${action}: ${error}`);
      },
      platform: ports.app.platform,
      stages,
    })
  );

  const tab: Tab = {
    appId: "gmail",
    health: "ok",
    id: ports.ids(),
    pinned: false,
    profileId: PROFILE_ID,
    sleeping: false,
    title: "Gmail",
    // The end-to-end suite asserts on views and bounds, never on a network page.
    url: e2e ? "about:blank" : "https://mail.google.com/",
    zoom: 1,
  };
  const group: Group = {
    id: ports.ids(),
    layout: leaf(ports.ids(), tab.id),
    profileId: PROFILE_ID,
    tabIds: [tab.id],
  };

  const window = new MainWindow({
    background: process.env.MERU_BACKGROUND === "1",
    onCreated: (created) => {
      dispatcher.assign(created.contentsId, rendererSurface);
      stages.open(created, group, [tab]);
    },
    ports,
    preload: path.join(dist, "preload", "renderer.cjs"),
    rendererFile: path.join(dist, "renderer", "chrome.html"),
    rendererUrl: process.env.MERU_RENDERER_URL,
  });
  await window.show();
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
