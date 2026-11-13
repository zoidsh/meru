import { describe, expect, it } from "vitest";

import { layout } from "../../../core/engines/layout.ts";
import { AppEvents } from "../../../core/events.ts";
import type { Style } from "../../../core/records/style.ts";
import { drag } from "../../../shared/channels/drag.ts";
import { stage as stageChannels } from "../../../shared/channels/stage.ts";
import { dragSurface } from "../../../shared/channels/surfaces.ts";
import { stageSnapshotSchema } from "../../../shared/stage.ts";
import type { StageSnapshot } from "../../../shared/stage.ts";
import { FakeApp } from "../../../test/fakes/app.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeCommandRegistrar } from "../../../test/fakes/commands.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeRegistrar } from "../../../test/fakes/registrar.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { FakeViewFactory } from "../../../test/fakes/view-factory.ts";
import type { FakeView } from "../../../test/fakes/view.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { Profiles } from "../profiles/index.ts";
import { SettingsStore } from "../settings/index.ts";
import { Stages } from "./index.ts";

const GMAIL = "https://mail.google.com/";

const settingsWith = (style: Style) => {
  const settings = new SettingsStore({
    app: new FakeApp(),
    clock: new FakeClock(),
    fs: new FakeFs(),
    onError: (error) => {
      throw error;
    },
    onFallback: () => {
      throw new Error("Nothing was read, so nothing can fall back");
    },
    registrar: new FakeRegistrar(),
    watchFile: false,
  });
  settings.set("appearance.style", style);
  return settings;
};

const setup = async (style: Style = "modern") => {
  const window = new FakeWindow(1200, 800);
  const settings = settingsWith(style);
  const views = new FakeViewFactory();
  const registrar = new FakeRegistrar();
  const commands = new FakeCommandRegistrar();
  const events = new AppEvents();
  const errors: unknown[] = [];
  const onError = (error: unknown) => {
    errors.push(error);
  };
  const profiles = new Profiles({
    app: new FakeApp(),
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
  const stages = new Stages({
    blankPanes: false,
    commands,
    dragPreload: "/dist/preload/drag.cjs",
    events,
    onError,
    profiles,
    registrar,
    settings,
    views,
  });
  stages.start();
  const changes = (): StageSnapshot[] =>
    registrar.pushes.map((pushed) => {
      expect(pushed).toMatchObject({
        channel: "stage.changed",
        contentsId: window.contentsId,
      });
      return stageSnapshotSchema.parse(pushed.payload);
    });
  const stage = stages.open(window, () => profiles.currentGroup()?.id);
  const id = window.contentsId;
  const profileId = profiles.selected().id;
  const paneIds = () => stage.snapshot().panes.map((pane) => pane.paneId);
  const splitId = () => stage.snapshot().dividers[0]?.splitId ?? "";
  return {
    changes,
    commands,
    errors,
    id,
    paneIds,
    profileId,
    profiles,
    registrar,
    settings,
    splitId,
    stage,
    stages,
    views,
    window,
  };
};

const childBounds = (window: FakeWindow) =>
  window.childViews().map((view) => view.bounds());

describe(Stages, () => {
  it("shows the group's one pane over the content area, inset, in the profile's session", async () => {
    const { window, views, changes, paneIds, profileId } = await setup();
    const [view] = views.created;

    expect(window.childViews()).toStrictEqual([view]);
    expect(view?.spec).toStrictEqual({
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
    expect(stage.zoomFactors).toStrictEqual([1.25, 1.25]);
    settings.set("stage.zoom", undefined, profileId);
    expect(stage.zoomFactors).toStrictEqual([1, 1]);
  });

  it("splits the focused pane with a new tab of its app, into two views in layout order that tile the window", async () => {
    const { window, views, stages, stage, id, changes, splitId, profiles } =
      await setup();

    expect(stages.split(id, "vertical")).toStrictEqual({
      ok: true,
      value: undefined,
    });

    const [first, second] = views.created;
    const expected = layout(
      stage.group?.layout ?? null,
      window.contentBounds(),
      "modern"
    );
    expect(window.childViews()).toStrictEqual([first, second]);
    expect(childBounds(window)).toStrictEqual([...expected.panes.values()]);
    expect({
      bounds: childBounds(window),
      focused: second?.focused,
      tabs: stage.group?.tabIds.map((tabId) => profiles.tab(tabId)?.appId),
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
    const { window, views, stages, id, stage } = await setup();
    const tabs = stage.group?.tabIds;
    stages.split(id, "horizontal");
    const [first, second] = views.created;

    expect(stages.close(id).ok).toBeTruthy();

    expect(window.childViews()).toStrictEqual([first]);
    expect({
      bounds: first?.bounds(),
      destroyed: second?.destroyed,
      focused: first?.focused,
      tabs: stage.group?.tabIds,
    }).toStrictEqual({
      bounds: { height: 784, width: 1184, x: 8, y: 8 },
      destroyed: true,
      focused: true,
      tabs,
    });
  });

  it("shows another group once the state says so, retiring the views of the one it showed", async () => {
    const { window, views, profiles, profileId, changes } = await setup();
    const [gmail] = views.created;
    const added = profiles.addTab(profileId, "calendar");
    expect(views.created).toHaveLength(1);
    if (!added.ok) {
      throw new Error(added.error);
    }
    profiles.moveTab(added.value.id, 0);
    const [, calendar] = views.created;
    expect({
      children: window.childViews(),
      destroyed: gmail?.destroyed,
      url: calendar?.url,
    }).toStrictEqual({
      children: [calendar],
      destroyed: true,
      url: "https://calendar.google.com/",
    });
    const shown = changes().at(-1);
    expect(shown?.focusedPaneId).toBe(shown?.panes[0]?.paneId);
  });

  it("keeps the last pane", async () => {
    const { window, stages, id } = await setup();
    expect(stages.close(id)).toStrictEqual({ error: "lastPane", ok: false });
    expect(window.childViews()).toHaveLength(1);
  });

  it("moves a view by removing it and inserting it again", async () => {
    const { window, views, stages, stage, id, paneIds } = await setup();
    stages.split(id, "vertical");
    const [first, second] = views.created;
    const before = window.effects.length;

    expect(stage.setFullscreen(paneIds()[0]).ok).toBeTruthy();

    expect(window.childViews()).toStrictEqual([second, first]);
    expect(window.effects.slice(before)).toStrictEqual([
      { kind: "remove", view: second },
      { index: 0, kind: "add", view: second },
    ]);
    expect(first?.bounds()).toStrictEqual(window.contentBounds());
    expect(first?.radius).toBe(0);
  });

  it("follows a window resize with bounds alone", async () => {
    const { window, stages, id, changes } = await setup();
    stages.split(id, "vertical");
    const before = window.effects.length;

    window.resize(1000, 600);

    expect(window.effects).toHaveLength(before);
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

  it("resizes a split and refuses one it does not have", async () => {
    const { window, stages, id, splitId } = await setup();
    stages.split(id, "vertical");

    expect(stages.resize(id, splitId(), 0.25).ok).toBeTruthy();
    expect(childBounds(window)[0]?.width).toBe(294);
    expect(stages.resize(id, "nope", 0.25)).toStrictEqual({
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
    expect(stages.focusPane(-1, "pane")).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });
});

const dragging = async () => {
  const context = await setup();
  context.stages.split(context.id, "vertical");
  context.registrar.pushes.length = 0;
  const result = context.stages.beginDrag(context.id, context.splitId());
  const overlay: FakeView | undefined = context.views.created[2];
  return { ...context, overlay, result };
};

describe("the stage commands", () => {
  it("are the five the stage declares", async () => {
    const { commands } = await setup();
    expect(commands.ids.toSorted()).toStrictEqual([
      "stage.closeTab",
      "stage.focusNext",
      "stage.focusPrevious",
      "stage.splitHorizontal",
      "stage.splitVertical",
    ]);
  });

  it("split and close panes in the window they are given", async () => {
    const { commands, id, window } = await setup();
    expect(commands.run("stage.splitVertical", id).ok).toBeTruthy();
    expect(commands.run("stage.splitHorizontal", id).ok).toBeTruthy();
    expect(window.childViews()).toHaveLength(3);
    expect(commands.run("stage.closeTab", id).ok).toBeTruthy();
    expect(window.childViews()).toHaveLength(2);
  });

  it("move focus to the next and previous pane in layout order, wrapping", async () => {
    const { commands, id, changes, paneIds } = await setup();
    commands.run("stage.splitVertical", id);
    commands.run("stage.splitHorizontal", id);
    const [first, second, third] = paneIds();
    const focused = () => changes().at(-1)?.focusedPaneId;
    const start = focused();
    const visited = [
      "stage.focusNext",
      "stage.focusPrevious",
      "stage.focusPrevious",
    ].map((command) => {
      const result = commands.run(command, id);
      return result.ok ? focused() : result.error;
    });
    expect([start, ...visited]).toStrictEqual([third, first, third, second]);
  });

  it("report what they could not do", async () => {
    const { commands, id } = await setup();
    expect(commands.run("stage.closeTab", id)).toStrictEqual({
      error: "lastPane",
      ok: false,
    });
    expect(commands.run("stage.splitVertical", -1)).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });
});

describe("the stage channels", () => {
  it("split and close the sender's window", async () => {
    const { registrar, id, window } = await setup();
    expect(
      registrar.call(stageChannels.split, { orientation: "horizontal" }, id)
    ).toStrictEqual({ ok: true, value: undefined });
    expect(window.childViews()).toHaveLength(2);
    expect(registrar.call(stageChannels.close, {}, id).ok).toBeTruthy();
    expect(window.childViews()).toHaveLength(1);
  });

  it("answer the snapshot a page paints first", async () => {
    const { registrar, id, changes } = await setup();
    expect(registrar.call(stageChannels.snapshot, {}, id)).toStrictEqual({
      ok: true,
      value: changes().at(-1),
    });
  });

  it("refuse a sender with no window", async () => {
    const { registrar } = await setup();
    expect(
      registrar.call(stageChannels.focusPane, { paneId: "p1" }, -1)
    ).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });
});

describe("a drag across panes", () => {
  it("lets the overlay use the drag channels while it is up, and no longer", async () => {
    const { registrar, overlay, window, stages, id } = await dragging();
    const sender = overlay?.contentsId ?? 0;
    expect(registrar.surfaces.get(sender)).toBe(dragSurface);

    registrar.call(drag.move, { buttons: 1, x: 300, y: 5 }, sender);
    expect(childBounds(window)[0]?.width).toBe(288);
    registrar.call(drag.end, { x: 300, y: 5 }, sender);

    expect(registrar.surfaces.has(sender)).toBeFalsy();
    expect(stages.snapshot(sender).ok).toBeFalsy();
    expect(stages.snapshot(id).ok).toBeTruthy();
  });

  it("covers every pane with a transparent overlay for its duration", async () => {
    const { window, overlay, views, result } = await dragging();
    expect(result.ok).toBeTruthy();
    expect(window.childViews()).toStrictEqual(views.created);
    expect(overlay?.url).toMatch(/^data:text\/html,.*col-resize/u);
    expect({
      background: overlay?.backgroundColor,
      bounds: overlay?.bounds(),
      spec: overlay?.spec,
    }).toStrictEqual({
      background: "#00000000",
      bounds: window.contentBounds(),
      spec: { preload: "/dist/preload/drag.cjs", radius: 0, zoom: 1 },
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
