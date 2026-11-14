import { noop } from "es-toolkit";

import { AppEvents } from "../core/events.ts";
import type { LogPort } from "../core/log.ts";
import type { Ids } from "../core/ports.ts";
import type { Entitlement } from "../core/records/entitlement.ts";
import { chromeSurface } from "../shared/channels/surfaces.ts";
import { commands as allCommands } from "../shared/commands/registry.ts";
import { FakeClock } from "../test/fakes/clock.ts";
import { FakeFs } from "../test/fakes/fs.ts";
import { fakeIds } from "../test/fakes/ids.ts";
import { FakeIpcTransport } from "../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../test/fakes/lifecycle.ts";
import { strictLog } from "../test/fakes/log.ts";
import { FakeSessions } from "../test/fakes/session.ts";
import { FakeViewFactory } from "../test/fakes/view-factory.ts";
import { FakeWindow } from "../test/fakes/window.ts";
import { Profiles } from "./features/profiles/index.ts";
import { SettingsStore } from "./features/settings/index.ts";
import { Stages } from "./features/stage/index.ts";
import type { StagesOptions } from "./features/stage/index.ts";
import { CommandDispatcher } from "./shell/commands.ts";
import { IpcDispatcher } from "./shell/ipc.ts";
import { ShortcutKeys } from "./shell/keys.ts";

const UNKNOWN: Entitlement = {
  expiresAt: null,
  kind: "unknown",
  source: "stored",
};

export const PRO: Entitlement = {
  deviceLimit: 3,
  expiresAt: null,
  kind: "licensed",
  plan: "pro",
  seat: null,
  source: "stored",
};

interface TestAppOptions {
  readonly clock?: FakeClock;
  readonly entitlement?: () => Entitlement;
  readonly fs?: FakeFs;
  readonly ids?: Ids;
  readonly lifecycle?: FakeLifecycle;
  /** The log the profiles write to; every other part writes to `strictLog`. */
  readonly log?: LogPort;
  readonly sessions?: FakeSessions;
  /** The tabs asleep, as the sleep feature tells the profiles. */
  readonly asleep?: () => ReadonlySet<string>;
}

/** The shell, the settings and the profiles, opened and started as `index.ts` does, over fakes a test may hand in. */
export const testApp = async ({
  asleep,
  clock = new FakeClock(),
  entitlement = () => UNKNOWN,
  fs = new FakeFs(),
  ids = fakeIds(),
  lifecycle = new FakeLifecycle(),
  log = strictLog,
  sessions = new FakeSessions(),
}: TestAppOptions = {}) => {
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ log: strictLog, transport });
  const commands = new CommandDispatcher();
  const events = new AppEvents();
  const settings = new SettingsStore({
    clock,
    entitlement,
    events,
    fs,
    lifecycle,
    log: strictLog,
    registrar,
    watchFile: false,
  });
  await settings.open();
  settings.start();
  const profiles = new Profiles({
    ...(asleep === undefined ? {} : { asleep }),
    clock,
    commands,
    entitlement,
    events,
    fs,
    ids,
    lifecycle,
    log,
    registrar,
    sessions,
    settings,
  });
  const opened = await profiles.open();
  profiles.start();
  return {
    clock,
    commands,
    events,
    fs,
    lifecycle,
    opened,
    profiles,
    registrar,
    sessions,
    settings,
    transport,
  };
};

type TestApp = Awaited<ReturnType<typeof testApp>>;

/** The stages over a test app, and `open`, which starts them with one window of 1200 by 800 that shows the group of the tab last focused, as the windows feature has it, once the test has built what must hear them first. */
export const testStages = (
  app: TestApp,
  options: Partial<StagesOptions> = {}
) => {
  const { commands, events, profiles, registrar, settings } = app;
  // Ahead of the stages, as the windows feature is, so a stage focusing the tab already shows its group.
  let shown: string | undefined;
  events.on("tab.focused", ({ groupId }) => {
    shown = groupId;
  });
  const views = new FakeViewFactory();
  const stages = new Stages({
    commands,
    dragPreload: undefined,
    events,
    insets: () => ({ left: 0, top: 0 }),
    keys: new ShortcutKeys({
      commands: allCommands,
      dispatcher: commands,
      log: strictLog,
      platform: "darwin",
      settings,
    }),
    log: strictLog,
    onOpen: () => false,
    onPopup: () => false,
    onSplitRequested: noop,
    overlayPreload: undefined,
    profiles,
    registrar,
    settings,
    tabDragUrl: (tab) =>
      `overlay.html?${new URLSearchParams({ appId: tab.appId, kind: "tabDrag", tabId: tab.id }).toString()}`,
    views,
    ...options,
  });
  const open = () => {
    stages.start();
    const window = new FakeWindow(1200, 800);
    registrar.assign(window.contentsId, chromeSurface);
    const stage = stages.open(
      window,
      () => shown ?? profiles.currentGroup()?.id
    );
    return { stage, window };
  };
  return { open, stages, views };
};
