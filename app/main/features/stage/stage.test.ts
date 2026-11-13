import { isEqual } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { layout } from "../../../core/engines/layout.ts";
import { AppEvents } from "../../../core/events.ts";
import type { Beside } from "../../../core/records/layout.ts";
import type { Style } from "../../../core/records/style.ts";
import { wireName } from "../../../shared/channels/define.ts";
import type { RequestChannel } from "../../../shared/channels/define.ts";
import { drag } from "../../../shared/channels/drag.ts";
import {
  stage as stageChannels,
  stagePushes,
  stageSnapshotSchema,
} from "../../../shared/channels/stage.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import { commands as allCommands } from "../../../shared/commands/registry.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeViewFactory } from "../../../test/fakes/view-factory.ts";
import type { FakeView } from "../../../test/fakes/view.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { ShortcutKeys } from "../../shell/keys.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Stages } from "./index.ts";
import type { Stage } from "./stage.ts";

const GMAIL = "https://mail.google.com/";

const VERTICAL_AFTER: Beside = { orientation: "vertical", side: "after" };

const rethrow = (error: unknown) => {
  throw error;
};

const settingsWith = (style: Style) => {
  const settings = new SettingsStore({
    lifecycle: new FakeLifecycle(),
    clock: new FakeClock(),
    fs: new FakeFs(),
    onError: (error) => {
      throw error;
    },
    onFallback: () => {
      throw new Error("Nothing was read, so nothing can fall back");
    },
    registrar: new IpcDispatcher({
      onError: rethrow,
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
  const errors: unknown[] = [];
  const onError = (error: unknown) => {
    errors.push(error);
  };
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({ onError, transport });
  registrar.assign(window.contentsId, chromeSurface);
  const call = (channel: RequestChannel, payload: unknown, sender: number) =>
    registrar.dispatch(sender, wireName(channel), payload);
  const commands = new CommandDispatcher();
  const profiles = new Profiles({
    commands,
    lifecycle: new FakeLifecycle(),
    clock: new FakeClock(),
    entitlement: { expiresAt: null, kind: "unknown", source: "stored" },
    events,
    fs: new FakeFs(),
    ids: fakeIds(),
    onError,
    registrar,
    report: onError,
    sessions: new FakeSessions(),
    settings,
  });
  await profiles.open();
  const insets = { left: 0, top: 0 };
  const stages = new Stages({
    background: () => "#ececf1",
    keys: new ShortcutKeys({
      commands: allCommands,
      dispatcher: commands,
      platform: "darwin",
      report: rethrow,
      settings,
    }),
    blankPanes: false,
    commands,
    dragPreload: "/dist/preload/drag.cjs",
    overlayPreload: "/dist/preload/renderer.cjs",
    events,
    insets: () => insets,
    onError,
    profiles,
    registrar,
    settings,
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
  const stage = stages.open(window, () => profiles.currentGroup()?.id);
  const id = window.contentsId;
  const profileId = profiles.selected().id;
  const paneIds = () => stage.snapshot().panes.map((pane) => pane.paneId);
  const splitId = () => stage.snapshot().dividers[0]?.splitId ?? "";
  return {
    call,
    changes,
    commands,
    errors,
    events,
    id,
    insets,
    paneIds,
    profileId,
    profiles,
    registrar,
    settings,
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

const unwrap = <T>(
  result: { ok: true; value: T } | { ok: false; error: unknown }
): T => {
  if (!result.ok) {
    throw new Error(`Expected success, got ${String(result.error)}`);
  }
  return result.value;
};

const childBounds = (window: FakeWindow) =>
  window.childViews().map((view) => view.bounds());

describe("the stage snapshot's comparison", () => {
  it("takes two snapshots that differ only in key order as the same, so the second is not published", () => {
    const sent: StageSnapshot = {
      dividers: [],
      focusedPaneId: "p1",
      navigation: null,
      panes: [{ paneId: "p1", rect: { height: 10, width: 10, x: 0, y: 0 } }],
      style: "modern",
    };
    const reordered: StageSnapshot = {
      style: "modern",
      panes: [{ rect: { y: 0, x: 0, width: 10, height: 10 }, paneId: "p1" }],
      focusedPaneId: "p1",
      navigation: null,
      dividers: [],
    };
    expect([
      isEqual(sent, reordered),
      isEqual(sent, { ...reordered, focusedPaneId: "p2" }),
    ]).toStrictEqual([true, false]);
  });
});

describe(Stages, () => {
  it("shows the group's one pane over the content area, inset, in the profile's session", async () => {
    const { window, views, changes, paneIds, profileId } = await setup();
    const [view] = views.created;

    expect(window.childViews()).toStrictEqual([view]);
    expect(view?.spec).toStrictEqual({
      background: "#ececf1",
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
      { paneId: paneIds()[0], rect: { height: 784, width: 1184, x: 8, y: 8 } },
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
    const { views, settings, changes, id, stages } = await setup("modern");
    stages.split(id, "vertical");
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
    const { views, settings, id, stages, stage, profileId } = await setup();
    settings.set("stage.zoom", 1.5, "work");
    expect(views.alive.map((view) => view.zoom)).toStrictEqual([1]);
    settings.set("stage.zoom", 1.25, profileId);
    stages.split(id, "vertical");
    expect(zoomOf(stage)).toStrictEqual([1.25, 1.25]);
    settings.set("stage.zoom", undefined, profileId);
    expect(zoomOf(stage)).toStrictEqual([1, 1]);
  });

  it("splits the focused pane with a new tab of its app, into two views in layout order that tile the window", async () => {
    const { window, views, stages, id, changes, splitId, profiles } =
      await setup();

    expect(stages.split(id, "vertical")).toStrictEqual({
      ok: true,
      value: undefined,
    });

    const [first, second] = views.created;
    const expected = layout(
      profiles.currentGroup()?.layout ?? null,
      window.contentBounds(),
      "modern"
    );
    expect(window.childViews()).toStrictEqual([first, second]);
    expect(childBounds(window)).toStrictEqual([...expected.panes.values()]);
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
      tabs: ["gmail", "gmail"],
      url: GMAIL,
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
    const { window, views, stages, id, profiles } = await setup();
    const tabs = profiles.currentGroup()?.tabIds;
    stages.split(id, "horizontal");
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

  it("shows another group once the state says so, detaching the views of the one it showed and keeping them", async () => {
    const { window, views, profiles, profileId, changes } = await setup();
    const [gmail] = views.created;
    const added = unwrap(profiles.addTab(profileId, "calendar"));
    expect(views.created).toHaveLength(1);
    profiles.moveTab(added.id, 0);
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
    const { window, views, profiles, profileId } = await setup();
    const [gmailId = ""] = profiles.currentGroup()?.tabIds ?? [];
    const calendar = unwrap(profiles.addTab(profileId, "calendar"));
    profiles.moveTab(calendar.id, 0);
    const [gmail, calendarView] = views.created;
    const seen: (readonly unknown[])[] = [];

    unwrap(profiles.joinTab(gmailId, calendar.id, VERTICAL_AFTER));
    seen.push(window.childViews());
    unwrap(profiles.leaveGroup(gmailId, 0));
    seen.push(window.childViews());
    profiles.moveTab(calendar.id, 0);
    seen.push(window.childViews());

    expect({
      created: views.created,
      destroyed: views.created.filter((view) => view.destroyed),
      seen,
    }).toStrictEqual({
      created: [gmail, calendarView],
      destroyed: [],
      seen: [[calendarView, gmail], [gmail], [calendarView]],
    });
  });

  it("disposes a closed tab's view even while its group is not shown", async () => {
    const { views, profiles, profileId } = await setup();
    const calendar = unwrap(profiles.addTab(profileId, "calendar"));
    profiles.moveTab(calendar.id, 0);
    const [gmail, calendarView] = views.created;
    profiles.moveTab(calendar.id, 1);

    unwrap(profiles.closeTab(calendar.id));

    expect([gmail?.destroyed, calendarView?.destroyed]).toStrictEqual([
      false,
      true,
    ]);
  });

  it("keeps the last pane", async () => {
    const { window, stages, id } = await setup();
    expect(stages.close(id)).toStrictEqual({ error: "lastPane", ok: false });
    expect(window.childViews()).toHaveLength(1);
  });

  it("follows a window resize with bounds alone", async () => {
    const { window, stages, id, changes } = await setup();
    stages.split(id, "vertical");
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
    const { stages, id } = await setup();
    stages.split(id, "vertical");
    expect(stages.beginDrag(id, "nope")).toStrictEqual({
      error: "unknownSplit",
      ok: false,
    });
  });

  it("disposes every view when the window closes", async () => {
    const { window, views, stages, id, splitId } = await setup();
    stages.split(id, "vertical");
    stages.beginDrag(id, splitId());

    window.close();

    expect(views.created).toHaveLength(3);
    expect(views.alive).toStrictEqual([]);
    expect(stages.split(id, "vertical")).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });

  it("refuses a window it does not know", async () => {
    const { stages } = await setup();
    expect(stages.split(-1, "vertical")).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });
});

const dragging = async () => {
  const context = await setup();
  context.stages.split(context.id, "vertical");
  context.transport.sent.length = 0;
  const result = context.stages.beginDrag(context.id, context.splitId());
  const overlay: FakeView | undefined = context.views.created[2];
  return { ...context, overlay, result };
};

describe("the stage commands", () => {
  it("are the five the stage declares", async () => {
    const { commands } = await setup();
    expect(
      (
        [
          "stage.closeTab",
          "stage.focusNext",
          "stage.focusPrevious",
          "stage.splitHorizontal",
          "stage.splitVertical",
          "stage.back",
          "stage.forward",
          "stage.reload",
        ] as const
      ).every((id) => commands.has(id))
    ).toBeTruthy();
  });

  it("split and close panes in the window they are given", async () => {
    const { commands, id, window } = await setup();
    expect(
      commands.run("stage.splitVertical", { windowId: id }).ok
    ).toBeTruthy();
    expect(
      commands.run("stage.splitHorizontal", { windowId: id }).ok
    ).toBeTruthy();
    expect(window.childViews()).toHaveLength(3);
    expect(commands.run("stage.closeTab", { windowId: id }).ok).toBeTruthy();
    expect(window.childViews()).toHaveLength(2);
  });

  it("move the focused pane back, forward and reload it", async () => {
    const { commands, id, views } = await setup();
    commands.run("stage.splitVertical", { windowId: id });
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
    const { commands, id, changes, paneIds } = await setup();
    commands.run("stage.splitVertical", { windowId: id });
    commands.run("stage.splitHorizontal", { windowId: id });
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

  it("report what they could not do", async () => {
    const { commands, id } = await setup();
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

describe("the stage channels", () => {
  it("move the focused pane through its history, or stop it, and tell the page where it stands", async () => {
    const { commands, id, views, changes, stages } = await setup();
    stages.split(id, "vertical");
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
    expect(stages.beginDrag(id, "id2")).toStrictEqual({
      error: "unknownSplit",
      ok: false,
    });
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
        { appId: "calendar", profileId, split: true },
        overlay
      ).ok
    ).toBeTruthy();
    expect(call(stageChannels.snapshot, {}, overlay).ok).toBeFalsy();
    expect(profiles.state.tabs.map((tab) => tab.appId)).toStrictEqual([
      "gmail",
      "calendar",
    ]);
    expect(stage.snapshot().panes).toHaveLength(2);
    expect(id).not.toBe(overlay);
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
      call(stageChannels.openTab, { appId, profileId, split: false }, overlay)
        .ok;
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
      call(
        stageChannels.openTab,
        { appId: "gmail", profileId, split: false },
        sender
      ).ok;
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
