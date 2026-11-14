import { describe, expect, it } from "vitest";

import type { MenuSection } from "../../../core/records/menu.ts";
import { wireName } from "../../../shared/channels/define.ts";
import {
  profilesPushes,
  profilesSnapshotSchema,
} from "../../../shared/channels/profiles.ts";
import { commands as allCommands } from "../../../shared/commands/registry.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { strictLog } from "../../../test/fakes/log.ts";
import { unwrap } from "../../../test/result.ts";
import { ApplicationMenu } from "../../shell/menu.ts";
import { testApp, testStages } from "../../testing.ts";
import { Sleep } from "./index.ts";

const MINUTE = 60_000;

const setup = async () => {
  const app = await testApp({ asleep: () => sleep.asleep() });
  const { clock, commands, events, profiles, settings, transport } = app;
  const { open, stages, views } = testStages(app, {
    historyOf: (tabId) => sleep.historyOf(tabId),
  });
  let windowId: number | undefined;
  const sleep = new Sleep({
    clock,
    windowId: () => windowId,
    commands,
    events,
    profiles,
    settings,
    stages,
  });
  // Started ahead of the stages, the other way round from the app's root, so a sweep cannot rely on the stages having heard a change first.
  sleep.start();
  const { window } = open();
  windowId = window.contentsId;
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
    events,
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

  it("wakes a tab where its page stood, with its history behind it, and forgets it once awake", async () => {
    const { clock, drive, gmail, profiles, show, viewOf } = await setup();
    unwrap(profiles.letSleep(drive.id, true));
    show(drive.id);
    viewOf(drive.id)?.go("https://drive.google.com/drive/folders/abc");
    show(gmail.id);
    clock.advance(60 * MINUTE);
    show(drive.id);
    const woken = viewOf(drive.id);
    show(gmail.id);
    clock.advance(60 * MINUTE);
    show(drive.id);
    expect([woken?.url, woken?.history(), viewOf(drive.id)?.url]).toStrictEqual(
      [
        "https://drive.google.com/drive/folders/abc",
        {
          entries: [
            { title: "", url: drive.url },
            { title: "", url: "https://drive.google.com/drive/folders/abc" },
          ],
          index: 1,
        },
        "https://drive.google.com/drive/folders/abc",
      ]
    );
  });

  it("shows the focused tab's leave to sleep as a check in the menu, rebuilt when it is toggled or another tab is focused", async () => {
    const { commands, drive, events, gmail, settings, show, window } =
      await setup();
    let built: readonly MenuSection<CommandId>[] = [];
    new ApplicationMenu({
      apply: (sections) => {
        built = sections;
      },
      commands: allCommands,
      dispatcher: commands,
      events,
      log: strictLog,
      platform: "darwin",
      settings,
      windowId: () => window.contentsId,
    }).start();
    const state = () => {
      const found = built
        .flatMap((section) => (section.kind === "role" ? [] : section.entries))
        .find(
          (entry) => entry.kind === "action" && entry.id === "sleep.toggleTab"
        );
      return found?.kind === "action"
        ? [found.enabled, found.checked]
        : undefined;
    };
    show(drive.id);
    const before = state();
    unwrap(commands.run("sleep.toggleTab", { windowId: window.contentsId }));
    const toggled = state();
    show(gmail.id);
    expect([before, toggled, state()]).toStrictEqual([
      [true, false],
      [true, true],
      [false, false],
    ]);
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
