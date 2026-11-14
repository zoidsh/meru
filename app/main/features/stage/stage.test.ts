import { describe, expect, it, vi } from "vitest";

import { AppEvents } from "../../../core/events.ts";
import type { Beside, Orientation } from "../../../core/records/layout.ts";
import type { Style } from "../../../core/records/style.ts";
import { wireName } from "../../../shared/channels/define.ts";
import type { RequestChannel } from "../../../shared/channels/define.ts";
import { drag, dragPushes } from "../../../shared/channels/drag.ts";
import {
  stage as stageChannels,
  stagePushes,
  stageSnapshotSchema,
} from "../../../shared/channels/stage.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { commandsOf } from "../../../shared/commands/define.ts";
import { commands as allCommands } from "../../../shared/commands/registry.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { strictLog } from "../../../test/fakes/log.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeViewFactory } from "../../../test/fakes/view-factory.ts";
import type { FakeView } from "../../../test/fakes/view.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { unwrap } from "../../../test/result.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { ShortcutKeys } from "../../shell/keys.ts";
import { Launcher } from "../launcher/index.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { stageCommands } from "./commands.ts";
import { Stages } from "./index.ts";
import type { Stage } from "./stage.ts";

const GMAIL = "https://mail.google.com/";

const VERTICAL_AFTER: Beside = { orientation: "vertical", side: "after" };

const settingsWith = (style: Style) => {
  const settings = new SettingsStore({
    entitlement: () => ({ expiresAt: null, kind: "unknown", source: "stored" }),
    events: new AppEvents(),
    lifecycle: new FakeLifecycle(),
    clock: new FakeClock(),
    fs: new FakeFs(),
    log: strictLog,
    registrar: new IpcDispatcher({
      log: strictLog,
      transport: new FakeIpcTransport(),
    }),
    watchFile: false,
  });
  settings.set("appearance.style", style);
  return settings;
};

const setup = async (style: Style = "modern") => {
  const window = new FakeWindow(1200, 800);
  const settings = settingsWith(style);
  const views = new FakeViewFactory();
  const events = new AppEvents();
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ log: strictLog, transport });
  registrar.assign(window.contentsId, chromeSurface);
  const call = (channel: RequestChannel, payload: unknown, sender: number) =>
    registrar.dispatch(sender, wireName(channel), payload);
  const commands = new CommandDispatcher();
  const profiles = new Profiles({
    commands,
    lifecycle: new FakeLifecycle(),
    clock: new FakeClock(),
    entitlement: () => ({ expiresAt: null, kind: "unknown", source: "stored" }),
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    log: strictLog,
    registrar,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  const insets = { left: 0, top: 0 };
  const stages = new Stages({
    keys: new ShortcutKeys({
      commands: allCommands,
      dispatcher: commands,
      platform: "darwin",
      log: strictLog,
      settings,
    }),
    blankPanes: false,
    commands,
    dragPreload: "/dist/preload/drag.cjs",
    overlayPreload: "/dist/preload/renderer.cjs",
    events,
    insets: () => insets,
    log: strictLog,
    profiles,
    onOpen: () => false,
    onPopup: () => true,
    registrar,
    settings,
    tabDragUrl: (tab) =>
      `overlay.html?${new URLSearchParams({ appId: tab.appId, kind: "tabDrag", tabId: tab.id }).toString()}`,
    views,
  });
  stages.start();
  const changes = (): StageSnapshot[] =>
    transport.sent
      .filter((pushed) => pushed.channel === wireName(stagePushes.changed))
      .map((pushed) => {
        expect(pushed.contentsId).toBe(window.contentsId);
        return stageSnapshotSchema.parse(pushed.payload);
      });
  // The window shows the group of the tab last shown, as the windows feature keeps it, else the profile's first.
  let showing: string | undefined;
  const show = (tabId: string) => {
    showing = tabId;
    events.emit("stage.invalidated", null);
  };
  const stage = stages.open(
    window,
    () =>
      (showing === undefined
        ? undefined
        : profiles.state.groups.find((group) =>
            group.tabIds.includes(showing ?? "")
          )?.id) ?? profiles.currentGroup()?.id
  );
  const id = window.contentsId;
  const profileId = profiles.selected().id;
  const paneIds = () => stage.snapshot().panes.map((pane) => pane.paneId);
  const splitId = () => stage.snapshot().dividers[0]?.splitId ?? "";
  /** Opens a Calendar tab beside the focused pane, as the launcher does for a split. */
  const split = (orientation: Orientation) =>
    stage.openTab(profileId, "calendar", orientation);
  return {
    call,
    changes,
    commands,
    events,
    id,
    insets,
    paneIds,
    profileId,
    profiles,
    registrar,
    settings,
    show,
    split,
    splitId,
    stage,
    stages,
    transport,
    views,
    window,
  };
};

const zoomOf = (stage: Stage) =>
  stage.panes().map(({ view }) => view.zoomFactor());

const childBounds = (window: FakeWindow) =>
  window.childViews().map((view) => view.bounds());

describe(Stages, () => {
  it("shows the group's one pane over the content area, inset, in the profile's session", async () => {
    const { window, views, changes, paneIds, profileId, profiles } =
      await setup();
    const [view] = views.created;

    expect(window.childViews()).toStrictEqual([view]);
    expect(view?.spec).toStrictEqual({
      background: "#ffffff",
      partition: `persist:${profileId}`,
      radius: 10,
      zoom: 1,
    });
    expect(view?.url).toBe(GMAIL);
    expect(view?.bounds()).toStrictEqual({
      height: 784,
      width: 1184,
      x: 8,
      y: 8,
    });
    expect(changes().at(-1)?.panes).toStrictEqual([
      {
        paneId: paneIds()[0],
        pinned: true,
        rect: { height: 784, width: 1184, x: 8, y: 8 },
        tabId: profiles.state.tabs[0]?.id,
      },
    ]);
  });

  it("lays the panes out in what the chrome leaves, again when that changes", async () => {
    const { views, insets, stages, changes } = await setup("classic");
    insets.top = 40;
    insets.left = 64;
    stages.relayout();
    const area = { height: 760, width: 1136, x: 64, y: 40 };
    expect(views.created[0]?.bounds()).toStrictEqual(area);
    expect(changes().at(-1)?.panes[0]?.rect).toStrictEqual(area);
  });

  it("keeps no gap where modern panes meet the titlebar and the sidebar", async () => {
    const { views, insets, stages } = await setup();
    insets.top = 40;
    insets.left = 64;
    stages.relayout();
    expect(views.created[0]?.bounds()).toStrictEqual({
      height: 752,
      width: 1128,
      x: 64,
      y: 40,
    });
  });

  it("draws classic edge to edge with square corners", async () => {
    const { views } = await setup("classic");
    expect(views.created[0]?.radius).toBe(0);
    expect(views.created[0]?.bounds()).toStrictEqual({
      height: 800,
      width: 1200,
      x: 0,
      y: 0,
    });
  });

  it("lays the panes out again when the appearance style changes", async () => {
    const { views, settings, changes, split } = await setup("modern");
    split("vertical");
    settings.set("appearance.style", "classic");
    expect(
      views.alive.map((view) => [view.radius, view.bounds()])
    ).toStrictEqual([
      [0, { height: 800, width: 600, x: 0, y: 0 }],
      [0, { height: 800, width: 599, x: 601, y: 0 }],
    ]);
    expect(changes().at(-1)?.style).toBe("classic");
  });

  it("zooms the panes of the profile whose zoom changed", async () => {
    const { views, settings, stage, profileId, split } = await setup();
    settings.set("stage.zoom", 1.5, "work");
    expect(views.alive.map((view) => view.zoom)).toStrictEqual([1]);
    settings.set("stage.zoom", 1.25, profileId);
    split("vertical");
    expect(zoomOf(stage)).toStrictEqual([1.25, 1.25]);
    settings.set("stage.zoom", undefined, profileId);
    expect(zoomOf(stage)).toStrictEqual([1, 1]);
  });

  it("splits the focused pane with a new tab, into two views in layout order that tile the window", async () => {
    const { window, views, changes, splitId, profiles, split } = await setup();

    expect(split("vertical")).toStrictEqual({
      ok: true,
      value: undefined,
    });

    const [first, second] = views.created;
    expect(window.childViews()).toStrictEqual([first, second]);
    expect({
      bounds: childBounds(window),
      focused: second?.focused,
      tabs: profiles
        .currentGroup()
        ?.tabIds.map((tabId) => profiles.tab(tabId)?.appId),
      url: second?.url,
    }).toStrictEqual({
      bounds: [
        { height: 784, width: 588, x: 8, y: 8 },
        { height: 784, width: 588, x: 604, y: 8 },
      ],
      focused: true,
      tabs: ["gmail", "calendar"],
      url: "https://calendar.google.com/",
    });
    expect(changes().at(-1)?.dividers).toStrictEqual([
      {
        orientation: "vertical",
        rect: { height: 784, width: 8, x: 596, y: 8 },
        splitId: splitId(),
      },
    ]);
  });

  it("closes the focused pane, destroying its view, and focuses its neighbour", async () => {
    const { window, views, stages, id, profiles, split } = await setup();
    const tabs = profiles.currentGroup()?.tabIds;
    split("horizontal");
    const [first, second] = views.created;

    expect(stages.close(id).ok).toBeTruthy();

    expect(window.childViews()).toStrictEqual([first]);
    expect({
      bounds: first?.bounds(),
      destroyed: second?.destroyed,
      focused: first?.focused,
      tabs: profiles.currentGroup()?.tabIds,
    }).toStrictEqual({
      bounds: { height: 784, width: 1184, x: 8, y: 8 },
      destroyed: true,
      focused: true,
      tabs,
    });
  });

  it("focuses the neighbour of a focused pane whose tab the sidebar closes", async () => {
    const { views, changes, paneIds, profiles, split, stage } = await setup();
    split("vertical");
    split("vertical");
    const [, middle, last] = paneIds();
    unwrap(stage.focusPane(middle ?? ""));
    const [, closing] = views.created;
    for (const view of views.created) {
      view.focused = false;
    }

    unwrap(profiles.closeTab(stage.snapshot().panes[1]?.tabId ?? ""));

    expect({
      closed: closing?.destroyed,
      focused: views.created.map((view) => view.focused),
      focusedPaneId: changes().at(-1)?.focusedPaneId,
    }).toStrictEqual({
      closed: true,
      focused: [false, false, true],
      focusedPaneId: last,
    });
  });

  it("shows another group once the state says so, detaching the views of the one it showed and keeping them", async () => {
    const { window, views, profiles, profileId, changes, show } = await setup();
    const [gmail] = views.created;
    const added = unwrap(profiles.addTab(profileId, "calendar"));
    expect(views.created).toHaveLength(1);
    show(added.id);
    const [, calendar] = views.created;
    expect({
      children: window.childViews(),
      destroyed: gmail?.destroyed,
      url: calendar?.url,
    }).toStrictEqual({
      children: [calendar],
      destroyed: false,
      url: "https://calendar.google.com/",
    });
    const shown = changes().at(-1);
    expect(shown?.focusedPaneId).toBe(shown?.panes[0]?.paneId);
  });

  it("keeps every tab's view through a join, a leave and a switch of group, so no page reloads", async () => {
    const { window, views, profiles, profileId, show } = await setup();
    const [gmailId = ""] = profiles.currentGroup()?.tabIds ?? [];
    const calendar = unwrap(profiles.addTab(profileId, "calendar"));
    show(calendar.id);
    const [gmail, calendarView] = views.created;
    const seen: (readonly unknown[])[] = [];

    unwrap(profiles.joinTab(calendar.id, gmailId, VERTICAL_AFTER));
    seen.push(window.childViews());
    unwrap(profiles.leaveGroup(calendar.id));
    seen.push(window.childViews());
    show(gmailId);
    seen.push(window.childViews());

    expect({
      created: views.created,
      destroyed: views.created.filter((view) => view.destroyed),
      seen,
    }).toStrictEqual({
      created: [gmail, calendarView],
      destroyed: [],
      seen: [[gmail, calendarView], [calendarView], [gmail]],
    });
  });

  it("disposes a closed tab's view even while its group is not shown", async () => {
    const { views, profiles, profileId, show } = await setup();
    const [gmailId = ""] = profiles.currentGroup()?.tabIds ?? [];
    const calendar = unwrap(profiles.addTab(profileId, "calendar"));
    show(calendar.id);
    const [gmail, calendarView] = views.created;
    show(gmailId);

    unwrap(profiles.closeTab(calendar.id));

    expect([gmail?.destroyed, calendarView?.destroyed]).toStrictEqual([
      false,
      true,
    ]);
  });

  it("answers every view it keeps with its tab, marking one no pane shows", async () => {
    const { stage, profiles, profileId, show } = await setup();
    const [gmailId = ""] = profiles.currentGroup()?.tabIds ?? [];
    const calendar = unwrap(profiles.addTab(profileId, "calendar"));
    show(calendar.id);
    show(gmailId);

    expect(
      stage.kept().map(({ tab, shown }) => ({ appId: tab.appId, shown }))
    ).toStrictEqual([
      { appId: "gmail", shown: true },
      { appId: "calendar", shown: false },
    ]);
  });

  it("keeps the last pane", async () => {
    const { window, stages, id } = await setup();
    expect(stages.close(id)).toStrictEqual({ error: "lastPane", ok: false });
    expect(window.childViews()).toHaveLength(1);
  });

  it("follows a window resize with bounds alone", async () => {
    const { window, changes, split } = await setup();
    split("vertical");
    const before = window.childViews();

    window.resize(1000, 600);

    expect(window.childViews()).toBe(before);
    expect(childBounds(window)).toStrictEqual([
      { height: 584, width: 488, x: 8, y: 8 },
      { height: 584, width: 488, x: 504, y: 8 },
    ]);
    expect(
      changes()
        .at(-1)
        ?.panes.map((pane) => pane.rect)
    ).toStrictEqual(childBounds(window));
  });

  it("refuses to drag a split it does not have", async () => {
    const { stages, id, split } = await setup();
    split("vertical");
    expect(
      stages.beginDrag(id, { kind: "divider", splitId: "nope" })
    ).toStrictEqual({
      error: "unknownSplit",
      ok: false,
    });
  });

  it("disposes every view when the window closes", async () => {
    const { window, views, stages, id, splitId, split } = await setup();
    split("vertical");
    stages.beginDrag(id, { kind: "divider", splitId: splitId() });

    window.close();

    expect(views.created).toHaveLength(3);
    expect(views.alive).toStrictEqual([]);
    expect(stages.close(id)).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });

  it("refuses a window it does not know", async () => {
    const { stages } = await setup();
    expect(stages.close(-1)).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });
});

const dragging = async () => {
  const context = await setup();
  context.split("vertical");
  context.transport.sent.length = 0;
  const result = context.stages.beginDrag(context.id, {
    kind: "divider",
    splitId: context.splitId(),
  });
  const overlay: FakeView | undefined = context.views.created[2];
  return { ...context, overlay, result };
};

describe("the stage commands", () => {
  it("are every one the stage declares, each enabled for its window", async () => {
    const { commands, id } = await setup();
    expect(
      commandsOf(stageCommands).filter(
        (command) => !commands.enabled(command.id, id)
      )
    ).toStrictEqual([]);
  });

  it("split by opening the launcher for the new pane's app over the window they are given, splitting nothing themselves", async () => {
    const { commands, events, id, registrar, stages, views, window, profiles } =
      await setup();
    new Launcher({
      commands,
      events,
      overlayUrl: (kind, query) =>
        `overlay.html?${new URLSearchParams({ ...query, kind }).toString()}`,
      registrar,
      stages,
    }).start();
    const opened = (run: CommandId) => {
      commands.run(run, { windowId: id });
      return new URL(views.created.at(-1)?.url ?? "", "file:///").search;
    };
    expect([
      opened("stage.splitVertical"),
      opened("stage.splitHorizontal"),
      window.childViews().length,
      profiles.currentGroup()?.tabIds.length,
    ]).toStrictEqual([
      "?split=vertical&kind=launcher",
      "?split=horizontal&kind=launcher",
      2,
      1,
    ]);
  });

  it("close panes in the window they are given", async () => {
    const { commands, id, window, split } = await setup();
    split("vertical");
    split("horizontal");
    expect(window.childViews()).toHaveLength(3);
    expect(commands.run("stage.closeTab", { windowId: id }).ok).toBeTruthy();
    expect(window.childViews()).toHaveLength(2);
  });

  it("move the focused pane back, forward and reload it", async () => {
    const { commands, id, views, split } = await setup();
    split("vertical");
    for (const command of [
      "stage.back",
      "stage.forward",
      "stage.reload",
    ] as const) {
      commands.run(command, { windowId: id });
    }
    expect(views.alive.map((view) => view.navigated)).toStrictEqual([
      [],
      ["back", "forward", "reload"],
    ]);
  });

  it("move focus to the next and previous pane in layout order, wrapping", async () => {
    const { commands, id, changes, paneIds, split } = await setup();
    split("vertical");
    split("horizontal");
    const [first, second, third] = paneIds();
    const focused = () => changes().at(-1)?.focusedPaneId;
    const start = focused();
    const steps = [
      "stage.focusNext",
      "stage.focusPrevious",
      "stage.focusPrevious",
    ] as const;
    const visited = steps.map((command: CommandId) => {
      const result = commands.run(command, { windowId: id });
      return result.ok ? focused() : result.error;
    });
    expect([start, ...visited]).toStrictEqual([third, first, third, second]);
  });

  it("swap the focused pane with the next in layout order, focus going with it", async () => {
    const { commands, id, changes, profiles, split } = await setup();
    split("vertical");
    split("horizontal");
    const tabsInOrder = () =>
      changes()
        .at(-1)
        ?.panes.map(({ tabId }) => tabId);
    const focusedTab = () => {
      const last = changes().at(-1);
      return last?.panes.find((pane) => pane.paneId === last.focusedPaneId)
        ?.tabId;
    };
    const [first, second, third] = tabsInOrder() ?? [];
    expect(focusedTab()).toBe(third);
    expect(commands.run("stage.swap", { windowId: id }).ok).toBeTruthy();
    expect(tabsInOrder()).toStrictEqual([third, second, first]);
    expect(focusedTab()).toBe(third);
    expect(profiles.currentGroup()?.tabIds).toHaveLength(3);
  });

  it("equalise the group's splits", async () => {
    const { commands, id, profiles, splitId, split } = await setup();
    split("vertical");
    unwrap(profiles.resize(profiles.currentGroup()?.id ?? "", splitId(), 0.2));
    expect(commands.run("stage.equalise", { windowId: id }).ok).toBeTruthy();
    const { layout: tree } = profiles.currentGroup() ?? {};
    expect(tree?.kind === "split" ? tree.ratio : undefined).toBe(0.5);
  });

  it("maximise the focused pane over the whole stage, and restore the others when run again", async () => {
    const { commands, id, window, changes, paneIds, split } = await setup();
    split("vertical");
    split("horizontal");
    const third = paneIds().at(2);
    const maximise = () => commands.run("stage.maximise", { windowId: id });

    expect(maximise().ok).toBeTruthy();
    expect(window.childViews()).toHaveLength(1);
    expect(changes().at(-1)).toMatchObject({
      dividers: [],
      focusedPaneId: third,
      panes: [
        { paneId: third, rect: { height: 784, width: 1184, x: 8, y: 8 } },
      ],
    });
    maximise();
    expect(window.childViews()).toHaveLength(3);
  });

  it("restore the others once another pane is focused or a tab is closed", async () => {
    const { commands, id, window, changes, paneIds, stage, split } =
      await setup();
    split("vertical");
    split("horizontal");
    // Gmail's one tab cannot close, so a Calendar pane is the one closed.
    const [, first] = paneIds();
    const maximise = () => commands.run("stage.maximise", { windowId: id });
    maximise();
    stage.focusPane(first ?? "");
    const focused = [
      window.childViews().length,
      changes().at(-1)?.focusedPaneId,
    ];
    maximise();
    commands.run("stage.closeTab", { windowId: id });
    expect([
      ...focused,
      window.childViews().length,
      changes().at(-1)?.dividers.length,
    ]).toStrictEqual([3, first, 2, 1]);
  });

  it("refuse what they could not do", async () => {
    const { commands, id } = await setup();
    expect(
      (["stage.swap", "stage.maximise"] as const).map(
        (command: CommandId) => commands.run(command, { windowId: id }).ok
      )
    ).toStrictEqual([false, false]);
    expect(commands.run("stage.closeTab", { windowId: id })).toStrictEqual({
      error: "lastPane",
      ok: false,
    });
    expect(commands.run("stage.splitVertical", { windowId: -1 })).toStrictEqual(
      {
        error: "unknownWindow",
        ok: false,
      }
    );
  });
});

describe("a page's fullscreen", () => {
  it("gives the pane the whole window, square, the other panes detached and the chrome covered, until the page leaves it", async () => {
    const { window, views, insets, split } = await setup();
    insets.top = 40;
    split("vertical");
    const [first, second] = views.alive;
    second?.fullscreen(true);
    const during = {
      bounds: second?.bounds(),
      children: window.childViews(),
      radius: second?.radius,
    };
    second?.fullscreen(false);
    expect([during, window.childViews(), second?.radius]).toStrictEqual([
      {
        bounds: { height: 800, width: 1200, x: 0, y: 0 },
        children: [second],
        radius: 0,
      },
      [first, second],
      10,
    ]);
  });

  it("stays above an overlay opened over it", async () => {
    const { window, views, split, stage } = await setup();
    split("vertical");
    const [, second] = views.alive;
    second?.fullscreen(true);
    stage.openOverlay("launcher", "file:///overlay.html");
    expect(window.childViews()).toStrictEqual([views.alive.at(-1), second]);
  });

  it("forgets the fullscreen tab once it closes, the others' panes laid out again", async () => {
    const { window, views, commands, id, split } = await setup();
    split("vertical");
    const [first, second] = views.alive;
    second?.fullscreen(true);
    commands.run("stage.closeTab", { windowId: id });
    expect([window.childViews(), first?.bounds()]).toStrictEqual([
      [first],
      { height: 784, width: 1184, x: 8, y: 8 },
    ]);
  });

  it("forgets the fullscreen tab once the group changes, so its pane comes back in its place", async () => {
    const { window, views, profiles, split, show } = await setup();
    split("vertical");
    const [, second] = views.alive;
    second?.fullscreen(true);
    const [, calendar = ""] = profiles.currentGroup()?.tabIds ?? [];
    profiles.leaveGroup(calendar);
    show(calendar);
    expect([
      window.childViews(),
      second?.bounds(),
      second?.radius,
    ]).toStrictEqual([[second], { height: 784, width: 1184, x: 8, y: 8 }, 10]);
  });

  it("ignores the leaving of a page that was not fullscreen", async () => {
    const { window, views, split } = await setup();
    split("vertical");
    const [first, second] = views.alive;
    second?.fullscreen(true);
    first?.fullscreen(false);
    expect(window.childViews()).toStrictEqual([second]);
  });
});

describe("the stage channels", () => {
  it("move the focused pane through its history, or stop it, and tell the page where it stands", async () => {
    const { commands, id, views, changes, split } = await setup();
    split("vertical");
    const [first, second] = views.alive;
    commands.run("stage.back", { windowId: id });
    commands.run("stage.stop", { windowId: id });
    expect([first?.navigated, second?.navigated]).toStrictEqual([
      [],
      ["back", "stop"],
    ]);
    const arrived = { canGoBack: true, canGoForward: false, loading: true };
    first?.arrive(arrived);
    expect(changes().at(-1)?.navigation).toStrictEqual({
      canGoBack: false,
      canGoForward: false,
      loading: false,
    });
    second?.arrive(arrived);
    expect(changes().at(-1)?.navigation).toStrictEqual(arrived);
  });

  it("answer the snapshot a page paints first", async () => {
    const { call, id, changes } = await setup();
    expect(call(stageChannels.snapshot, {}, id)).toStrictEqual({
      ok: true,
      value: changes().at(-1),
    });
  });

  it("refuse a sender with no window", async () => {
    const { call, registrar } = await setup();
    registrar.assign(-1, chromeSurface);
    expect(call(stageChannels.snapshot, {}, -1)).toStrictEqual({
      error: { kind: "failed", message: "unknownWindow" },
      ok: false,
    });
  });
});

describe("a drag across panes", () => {
  it("lets the overlay use the drag channels while it is up, and no longer", async () => {
    const { call, overlay, window, stages, id } = await dragging();
    const sender = overlay?.contentsId ?? 0;

    const moved = call(drag.move, { buttons: 1, x: 300, y: 5 }, sender).ok;
    const width = childBounds(window)[0]?.width;
    const ended = call(drag.end, { x: 300, y: 5 }, sender).ok;
    expect({ ended, moved, width }).toStrictEqual({
      ended: true,
      moved: true,
      width: 288,
    });

    expect(call(drag.end, { x: 300, y: 5 }, sender)).toMatchObject({
      error: { kind: "wrongSurface" },
      ok: false,
    });
    expect(stages.snapshot(sender).ok).toBeFalsy();
    expect(stages.snapshot(id).ok).toBeTruthy();
  });

  it("ends on a cancel from the overlay's page, taking no ratio and telling the chrome page", async () => {
    const { call, overlay, profiles, transport, window, id } = await dragging();
    const sender = overlay?.contentsId ?? 0;
    const before = profiles.currentGroup()?.layout;
    call(drag.move, { buttons: 1, x: 300, y: 5 }, sender);
    expect(call(stageChannels.cancelDrag, {}, sender).ok).toBeTruthy();
    expect({
      children: window.childViews().length,
      destroyed: overlay?.destroyed,
      layout: profiles.currentGroup()?.layout,
      told: transport.sent.filter(
        (pushed) => pushed.channel === wireName(stagePushes.dragCancelled)
      ),
    }).toStrictEqual({
      children: 2,
      destroyed: true,
      layout: before,
      told: [
        {
          channel: wireName(stagePushes.dragCancelled),
          contentsId: id,
          payload: {},
        },
      ],
    });
  });

  it("covers every pane with a transparent overlay for its duration", async () => {
    const { window, overlay, views, result } = await dragging();
    expect(result.ok).toBeTruthy();
    expect(window.childViews()).toStrictEqual(views.created);
    expect(overlay?.url).toMatch(/^data:text\/html,.*col-resize/u);
    expect({
      bounds: overlay?.bounds(),
      spec: overlay?.spec,
    }).toStrictEqual({
      bounds: window.contentBounds(),
      spec: {
        background: "#00000000",
        preload: "/dist/preload/drag.cjs",
        radius: 0,
        zoom: 1,
      },
    });
  });

  it("moves the panes and tells the chrome page with each move, so the divider follows the pointer", async () => {
    const { window, overlay, stages, changes } = await dragging();

    expect(
      stages.dragTo(overlay?.contentsId ?? 0, { x: 300, y: 400 }, 1).ok
    ).toBeTruthy();
    stages.dragTo(overlay?.contentsId ?? 0, { x: 320, y: 400 }, 1);
    expect(childBounds(window)[0]?.width).toBe(308);
    expect(changes().map((change) => change.dividers[0]?.rect.x)).toStrictEqual(
      [296, 316]
    );
  });

  it("removes the overlay on release, having sent where the release left the divider", async () => {
    const { window, overlay, stages, changes } = await dragging();

    expect(
      stages.endDrag(overlay?.contentsId ?? 0, { x: 400, y: 400 }).ok
    ).toBeTruthy();
    expect(childBounds(window)).toStrictEqual([
      { height: 784, width: 388, x: 8, y: 8 },
      { height: 784, width: 788, x: 404, y: 8 },
    ]);
    expect(overlay?.destroyed).toBeTruthy();
    expect(changes().map((change) => change.dividers[0]?.rect.x)).toStrictEqual(
      [396]
    );
  });

  it("takes moves from the chrome page too, and ignores one with no button held", async () => {
    const { window, overlay, stages, id } = await dragging();

    expect(stages.dragTo(id, { x: 500, y: 10 }, 1).ok).toBeTruthy();
    expect(stages.dragTo(id, { x: 900, y: 10 }, 0).ok).toBeTruthy();
    expect(stages.endDrag(id, { x: 500, y: 10 }).ok).toBeTruthy();

    const late = stages.dragTo(id, { x: 700, y: 10 }, 1);
    expect({
      destroyed: overlay?.destroyed,
      late: late.ok,
      width: childBounds(window)[0]?.width,
    }).toStrictEqual({ destroyed: true, late: true, width: 488 });
    expect(
      stages.dragTo(overlay?.contentsId ?? 0, { x: 1, y: 1 }, 1)
    ).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });

  it("refuses a split the layout does not have", async () => {
    const { stages, id } = await setup();
    expect(
      stages.beginDrag(id, { kind: "divider", splitId: "id2" })
    ).toStrictEqual({
      error: "unknownSplit",
      ok: false,
    });
  });
});

const draggingTab = async () => {
  const context = await setup();
  const { profiles, profileId, stages, id, views } = context;
  const [gmail = ""] = profiles.currentGroup()?.tabIds ?? [];
  const calendar = unwrap(profiles.addTab(profileId, "calendar"));
  context.transport.sent.length = 0;
  const result = stages.beginDrag(id, { kind: "tab", tabId: calendar.id });
  const overlay = views.created.at(-1);
  const groupOf = (tabId: string) =>
    profiles.state.groups.find((group) => group.tabIds.includes(tabId));
  return { ...context, calendar, gmail, groupOf, overlay, result };
};

describe("a sidebar row dragged over the panes", () => {
  it("covers the panes with the overlay page on the tab drag's surface, naming the tab", async () => {
    const { calendar, overlay, result, window } = await draggingTab();
    expect(result.ok).toBeTruthy();
    const url = new URL(overlay?.url ?? "", "file:///");
    expect({
      bounds: overlay?.bounds(),
      query: Object.fromEntries(url.searchParams),
      spec: overlay?.spec,
    }).toStrictEqual({
      bounds: window.contentBounds(),
      query: { appId: "calendar", kind: "tabDrag", tabId: calendar.id },
      spec: {
        arguments: ["--meru-surface=tabDrag"],
        background: "#00000000",
        preload: "/dist/preload/renderer.cjs",
        radius: 0,
        zoom: 1,
      },
    });
  });

  it("takes the keyboard once its page has loaded, and gives it back to the focused pane when the drag ends or is cancelled", async () => {
    const { calendar, id, overlay, stages, views } = await draggingTab();
    const focusedPane = () =>
      views.created.find(
        (view) => view !== overlay && view.focused && !view.destroyed
      );
    await vi.waitFor(() => {
      expect(overlay?.focused).toBeTruthy();
    });
    const taken = overlay?.focused;
    for (const view of views.created) {
      view.focused = false;
    }
    stages.cancelDrag(id);
    const afterCancel = focusedPane() !== undefined;
    for (const view of views.created) {
      view.focused = false;
    }
    stages.beginDrag(id, { kind: "tab", tabId: calendar.id });
    stages.endDrag(id, { x: -1, y: -1 });
    const afterEnd = focusedPane() !== undefined;
    expect({ afterCancel, afterEnd, taken }).toStrictEqual({
      afterCancel: true,
      afterEnd: true,
      taken: true,
    });
  });

  it("refuses a tab it does not know, covering nothing", async () => {
    const { stages, id, window } = await setup();
    expect([
      stages.beginDrag(id, { kind: "tab", tabId: "nope" }),
      window.childViews().length,
    ]).toStrictEqual([{ error: "unknownTab", ok: false }, 1]);
  });

  it("lets its page read the panes and end the drag, and nothing else", async () => {
    const { call, calendar, overlay } = await draggingTab();
    const sender = overlay?.contentsId ?? 0;
    expect(call(stageChannels.snapshot, {}, sender).ok).toBeTruthy();
    expect(
      call(
        stageChannels.openTab,
        { appId: "drive", profileId: calendar.profileId },
        sender
      )
    ).toMatchObject({ error: { kind: "unknownChannel" }, ok: false });
    expect(call(drag.end, { x: -1, y: -1 }, sender).ok).toBeTruthy();
    expect(overlay?.destroyed).toBeTruthy();
  });

  it("hands the chrome page's pointer to the overlay's page alone, leaving the panes where they are", async () => {
    const { id, overlay, stages, transport, window } = await draggingTab();
    const before = childBounds(window);
    stages.dragTo(id, { x: 300, y: 400 }, 1);
    stages.dragTo(id, { x: 320, y: 410 }, 1);
    expect(
      transport.sent.map(({ channel, contentsId, payload }) => ({
        channel,
        payload,
        toOverlay: contentsId === overlay?.contentsId,
      }))
    ).toStrictEqual([
      {
        channel: wireName(dragPushes.pointer),
        payload: { x: 300, y: 400 },
        toOverlay: true,
      },
      {
        channel: wireName(dragPushes.pointer),
        payload: { x: 320, y: 410 },
        toOverlay: true,
      },
    ]);
    expect(childBounds(window)).toStrictEqual(before);
  });

  it("joins the tab beside the pane it is let go on, keeping focus on the pane that had it", async () => {
    const { calendar, gmail, groupOf, id, overlay, stage, stages } =
      await draggingTab();
    expect(stages.endDrag(id, { x: 50, y: 400 }).ok).toBeTruthy();
    const snapshot = stage.snapshot();
    expect({
      destroyed: overlay?.destroyed,
      focused: snapshot.panes.find(
        (pane) => pane.paneId === snapshot.focusedPaneId
      )?.tabId,
      group: groupOf(gmail)?.tabIds,
      layout: groupOf(gmail)?.layout?.kind,
      panes: snapshot.panes.map((pane) => pane.tabId),
    }).toStrictEqual({
      destroyed: true,
      focused: gmail,
      group: [gmail, calendar.id],
      layout: "split",
      panes: [gmail, calendar.id],
    });
  });

  it.each([
    ["left", { x: 50, y: 400 }, "vertical"],
    ["right", { x: 1150, y: 400 }, "vertical"],
    ["top", { x: 600, y: 50 }, "horizontal"],
    ["bottom", { x: 600, y: 750 }, "horizontal"],
  ] as const)(
    "joins the tab by the %s edge of the pinned Gmail pane in that orientation, always after it",
    async (_edge, point, orientation) => {
      const { calendar, gmail, groupOf, id, stage, stages } =
        await draggingTab();
      stages.endDrag(id, point);
      const joined = groupOf(gmail)?.layout;
      expect({
        orientation: joined?.kind === "split" ? joined.orientation : undefined,
        panes: stage.snapshot().panes.map((pane) => pane.tabId),
      }).toStrictEqual({
        orientation,
        panes: [gmail, calendar.id],
      });
    }
  );

  it("joins the tab after the pane when it is let go in the middle, split side by side", async () => {
    const { calendar, gmail, groupOf, id, stage, stages } = await draggingTab();
    stages.endDrag(id, { x: 600, y: 400 });
    const joined = groupOf(gmail)?.layout;
    expect({
      orientation: joined?.kind === "split" ? joined.orientation : undefined,
      panes: stage.snapshot().panes.map((pane) => pane.tabId),
    }).toStrictEqual({ orientation: "vertical", panes: [gmail, calendar.id] });
  });

  it.each([
    ["a release outside every pane", { x: 1300, y: 400 }],
    ["being cancelled", undefined],
  ])("ends on %s, changing nothing", async (_how, point) => {
    const { calendar, groupOf, id, overlay, profiles, stages } =
      await draggingTab();
    const before = profiles.state;
    expect(
      (point === undefined ? stages.cancelDrag(id) : stages.endDrag(id, point))
        .ok
    ).toBeTruthy();
    expect({
      alone: groupOf(calendar.id)?.tabIds,
      destroyed: overlay?.destroyed,
      same: profiles.state === before,
    }).toStrictEqual({ alone: [calendar.id], destroyed: true, same: true });
  });
});

describe("an overlay over the panes", () => {
  it("opens a tab beside the focused pane from the overlay's own page, on the surface it was given", async () => {
    const { call, id, profiles, stage, views } = await setup();
    stage.openOverlay("launcher", "file:///overlay.html");
    const overlay = views.created.at(-1)?.contentsId ?? 0;
    const profileId = profiles.selected().id;
    expect(
      call(
        stageChannels.openTab,
        { appId: "calendar", profileId, split: "vertical" },
        overlay
      ).ok
    ).toBeTruthy();
    expect(call(stageChannels.snapshot, {}, overlay).ok).toBeFalsy();
    expect(profiles.state.tabs.map((tab) => tab.appId)).toStrictEqual([
      "gmail",
      "calendar",
    ]);
    expect([
      stage.snapshot().panes.length,
      stage.snapshot().dividers[0]?.orientation,
    ]).toStrictEqual([2, "vertical"]);
    expect(id).not.toBe(overlay);
  });

  it("opens a tab below the focused pane when the split names the horizontal orientation", async () => {
    const { call, profileId, stage, views } = await setup();
    stage.openOverlay("launcher", "file:///overlay.html");
    const overlay = views.created.at(-1)?.contentsId ?? 0;
    call(
      stageChannels.openTab,
      { appId: "calendar", profileId, split: "horizontal" },
      overlay
    );
    expect(
      stage.snapshot().dividers.map((divider) => divider.orientation)
    ).toStrictEqual(["horizontal"]);
  });

  it("opens a tab in a group of its own and shows it, and brings Gmail's one tab to the front instead of adding another", async () => {
    const { call, events, profiles, stage, views } = await setup();
    const focused: string[] = [];
    events.on("tab.focused", ({ tabId }) => {
      focused.push(profiles.tab(tabId)?.appId ?? tabId);
    });
    stage.openOverlay("launcher", "file:///overlay.html");
    const overlay = views.created.at(-1)?.contentsId ?? 0;
    const profileId = profiles.selected().id;
    const open = (appId: string) =>
      call(stageChannels.openTab, { appId, profileId }, overlay).ok;
    expect([open("drive"), open("gmail")]).toStrictEqual([true, true]);
    expect({
      focused,
      groups: profiles.state.groups.map((group) => group.tabIds.length),
      tabs: profiles.state.tabs.map((tab) => tab.appId),
    }).toStrictEqual({
      focused: ["drive", "gmail"],
      groups: [1, 1],
      tabs: ["gmail", "drive"],
    });
  });

  it("is a transparent renderer page above every pane, focused once loaded, until it is closed", async () => {
    const { call, profileId, window, views, stage } = await setup();
    stage.openOverlay("launcher", "file:///overlay.html");
    const [pane, overlay] = views.created;
    await expect.poll(() => overlay?.focused).toBeTruthy();
    expect({
      spec: overlay?.spec,
      top: window.childViews().at(-1) === overlay,
      url: overlay?.url,
    }).toStrictEqual({
      spec: {
        arguments: ["--meru-surface=launcher"],
        background: "#00000000",
        preload: "/dist/preload/renderer.cjs",
        radius: 0,
        zoom: 1,
      },
      top: true,
      url: "file:///overlay.html",
    });
    const sender = overlay?.contentsId ?? 0;
    const asks = () =>
      call(stageChannels.openTab, { appId: "gmail", profileId }, sender).ok;
    expect(asks()).toBeTruthy();
    if (pane !== undefined) {
      pane.focused = false;
    }
    stage.closeOverlay();
    expect([
      overlay?.destroyed,
      pane?.focused,
      window.childViews().some((view) => view === overlay),
      asks(),
    ]).toStrictEqual([true, true, false, false]);
  });
});
