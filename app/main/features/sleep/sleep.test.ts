import { noop } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { AppEvents } from "../../../core/events.ts";
import { wireName } from "../../../shared/channels/define.ts";
import {
  profilesPushes,
  profilesSnapshotSchema,
} from "../../../shared/channels/profiles.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { commands as allCommands } from "../../../shared/commands/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { strictLog } from "../../../test/fakes/log.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeViewFactory } from "../../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { unwrap } from "../../../test/result.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { ShortcutKeys } from "../../shell/keys.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Stages } from "../stage/index.ts";
import { Sleep } from "./index.ts";

const MINUTE = 60_000;

const setup = async () => {
  const window = new FakeWindow(1200, 800);
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ log: strictLog, transport });
  registrar.assign(window.contentsId, chromeSurface);
  const clock = new FakeClock();
  const events = new AppEvents();
  const settings = new SettingsStore({
    clock,
    entitlement: () => ({ expiresAt: null, kind: "free", source: "stored" }),
    events,
    fs: new FakeFs(),
    lifecycle: new FakeLifecycle(),
    log: strictLog,
    registrar,
    watchFile: false,
  });
  const commands = new CommandDispatcher();
  const profiles = new Profiles({
    clock,
    commands,
    entitlement: () => ({ expiresAt: null, kind: "free", source: "stored" }),
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    lifecycle: new FakeLifecycle(),
    log: strictLog,
    registrar,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  // As the windows feature does, and ahead of the stages, the window shows the group of the tab last brought to the front.
  let shown: string | undefined;
  events.on("tab.focused", ({ groupId }) => {
    shown = groupId;
  });
  const views = new FakeViewFactory();
  const stages = new Stages({
    blankPanes: false,
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
    tabDragUrl: () => "overlay.html",
    views,
  });
  stages.start();
  stages.open(window, () => shown ?? profiles.currentGroup()?.id);
  const sleep = new Sleep({
    clock,
    commands,
    events,
    profiles,
    settings,
    stages,
  });
  sleep.start();
  const [gmail] = profiles.state.tabs;
  if (gmail === undefined) {
    throw new Error("A first launch has a Gmail tab");
  }
  const drive = unwrap(profiles.openTab(gmail.profileId, "drive"));
  const asleep = () =>
    transport.sent
      .filter((sent) => sent.channel === wireName(profilesPushes.changed))
      .map((sent) => profilesSnapshotSchema.parse(sent.payload))
      .at(-1)
      ?.tabs.filter((tab) => tab.asleep)
      .map((tab) => tab.id) ?? [];
  const viewOf = (tabId: string) => {
    const kept = stages
      .find(window.contentsId)
      ?.kept()
      .find(({ tab }) => tab.id === tabId)?.view;
    return views.created.find((made) => made === kept);
  };
  const show = (tabId: string) => {
    unwrap(profiles.focusTab(tabId));
  };
  return {
    asleep,
    clock,
    commands,
    drive,
    gmail,
    profiles,
    settings,
    show,
    viewOf,
    window,
  };
};

describe(Sleep, () => {
  it("puts a tab the user let sleep to sleep once it has been out of sight for the setting's minutes, and wakes it with a new view when shown", async () => {
    const { asleep, clock, commands, drive, gmail, show, viewOf, window } =
      await setup();
    show(drive.id);
    const before = viewOf(drive.id);
    unwrap(commands.run("sleep.toggleTab", { windowId: window.contentsId }));
    show(gmail.id);
    clock.advance(60 * MINUTE - 1);
    const awake = [asleep(), viewOf(drive.id) === before];
    clock.advance(1);
    const slept = [asleep(), viewOf(drive.id), before?.destroyed];
    show(drive.id);
    const woken = viewOf(drive.id);
    expect([
      awake,
      slept,
      asleep(),
      woken !== undefined && woken !== before,
    ]).toStrictEqual([[[], true], [[drive.id], undefined, true], [], true]);
  });

  it("leaves a tab asleep only by the user's leave, never Gmail, and keeps one awake while its page plays sound", async () => {
    const {
      asleep,
      clock,
      commands,
      drive,
      gmail,
      profiles,
      show,
      viewOf,
      window,
    } = await setup();
    show(drive.id);
    clock.advance(2 * 60 * MINUTE);
    show(gmail.id);
    const notLet = [
      asleep(),
      commands.enabled("sleep.toggleTab", window.contentsId),
    ];
    show(drive.id);
    unwrap(profiles.letSleep(drive.id, true));
    const sounding = viewOf(drive.id);
    if (sounding !== undefined) {
      sounding.sounding = true;
    }
    show(gmail.id);
    clock.advance(3 * 60 * MINUTE);
    expect([notLet, asleep(), profiles.letSleep(gmail.id, true)]).toStrictEqual(
      [[[], false], [], { error: "pinned", ok: false }]
    );
  });

  it("counts the wait from when a tab watched a long while leaves the screen, and from when its sound stops", async () => {
    const { asleep, clock, drive, gmail, profiles, show, viewOf } =
      await setup();
    unwrap(profiles.letSleep(drive.id, true));
    show(drive.id);
    clock.advance(70 * MINUTE);
    const view = viewOf(drive.id);
    view?.sound(true);
    show(gmail.id);
    clock.advance(59 * MINUTE);
    view?.sound(false);
    clock.advance(59 * MINUTE);
    const beforeDue = asleep();
    clock.advance(MINUTE);
    expect([beforeDue, asleep()]).toStrictEqual([[], [drive.id]]);
  });

  it("schedules no sweep while no tab can sleep, and follows a change of the minutes", async () => {
    const { asleep, clock, drive, gmail, profiles, settings, show } =
      await setup();
    // Past the profiles' and settings' debounced writes, so only the sweep's timer can be left.
    const settle = () => {
      clock.advance(MINUTE);
    };
    settle();
    const idle = clock.pending;
    unwrap(profiles.letSleep(drive.id, true));
    show(gmail.id);
    settle();
    const waiting = clock.pending;
    unwrap(settings.set("sleep.afterMinutes", 5));
    clock.advance(4 * MINUTE);
    expect([idle, waiting, asleep()]).toStrictEqual([0, 1, [drive.id]]);
  });
});
