import { describe, expect, it } from "vitest";

import { layout, leaf } from "../../../core/engines/layout.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Style } from "../../../core/records/style.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { drag } from "../../../shared/channels/drag.ts";
import { stage as stageChannels } from "../../../shared/channels/stage.ts";
import { dragSurface } from "../../../shared/channels/surfaces.ts";
import { stageSnapshotSchema } from "../../../shared/stage.ts";
import type { StageSnapshot } from "../../../shared/stage.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeRegistrar } from "../../../test/fakes/registrar.ts";
import { FakeViewFactory } from "../../../test/fakes/view-factory.ts";
import type { FakeView } from "../../../test/fakes/view.ts";
import { FakeWindow } from "../../../test/fakes/window.ts";
import { Stages } from "./index.ts";

const GMAIL = "https://mail.google.com/";

const setup = (style: Style = "modern") => {
  const window = new FakeWindow(1200, 800);
  const views = new FakeViewFactory();
  const registrar = new FakeRegistrar();
  const errors: unknown[] = [];
  const stages = new Stages({
    dragPreload: "/dist/preload/drag.cjs",
    e2e: false,
    ids: fakeIds(),
    onError: (error) => {
      errors.push(error);
    },
    registrar,
    style,
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
  const tab: Tab = {
    appId: "gmail",
    health: "ok",
    id: "t1",
    pinned: false,
    profileId: "dev",
    sleeping: false,
    title: "Gmail",
    url: GMAIL,
    zoom: 1,
  };
  const group: Group = {
    id: "g1",
    layout: leaf("p1", "t1"),
    profileId: "dev",
    tabIds: ["t1"],
  };
  const stage = stages.open(window, group, [tab]);
  const id = window.contentsId;
  return { changes, errors, id, registrar, stage, stages, views, window };
};

const childBounds = (window: FakeWindow) =>
  window.childViews().map((view) => view.bounds());

describe(Stages, () => {
  it("shows the group's one pane over the content area, inset, in the profile's session", () => {
    const { window, views, changes } = setup();
    const [view] = views.created;

    expect(window.childViews()).toStrictEqual([view]);
    expect(view?.spec).toStrictEqual({
      partition: "persist:dev",
      radius: 10,
    });
    expect(view?.url).toBe(GMAIL);
    expect(view?.bounds()).toStrictEqual({
      height: 784,
      width: 1184,
      x: 8,
      y: 8,
    });
    expect(changes().at(-1)?.panes).toStrictEqual([
      { paneId: "p1", rect: { height: 784, width: 1184, x: 8, y: 8 } },
    ]);
  });

  it("draws classic edge to edge with square corners", () => {
    const { views } = setup("classic");
    expect(views.created[0]?.radius).toBe(0);
    expect(views.created[0]?.bounds()).toStrictEqual({
      height: 800,
      width: 1200,
      x: 0,
      y: 0,
    });
  });

  it("splits the focused pane into two views in layout order that tile the window", () => {
    const { window, views, stages, stage, id, changes } = setup();

    expect(stages.split(id, "vertical")).toStrictEqual({
      ok: true,
      value: undefined,
    });

    const [first, second] = views.created;
    const expected = layout(
      stage.group.layout,
      window.contentBounds(),
      "modern"
    );
    expect(window.childViews()).toStrictEqual([first, second]);
    expect(childBounds(window)).toStrictEqual([...expected.panes.values()]);
    expect({
      bounds: childBounds(window),
      focused: second?.focused,
      tabs: stage.group.tabIds.length,
      url: second?.url,
    }).toStrictEqual({
      bounds: [
        { height: 784, width: 588, x: 8, y: 8 },
        { height: 784, width: 588, x: 604, y: 8 },
      ],
      focused: true,
      tabs: 2,
      url: GMAIL,
    });
    expect(changes().at(-1)?.dividers).toStrictEqual([
      {
        orientation: "vertical",
        rect: { height: 784, width: 8, x: 596, y: 8 },
        splitId: "id2",
      },
    ]);
  });

  it("closes the focused pane, destroying its view, and focuses its neighbour", () => {
    const { window, views, stages, id, stage } = setup();
    stages.split(id, "horizontal");
    const [first, second] = views.created;

    expect(stages.close(id).ok).toBeTruthy();

    expect(window.childViews()).toStrictEqual([first]);
    expect({
      bounds: first?.bounds(),
      destroyed: second?.destroyed,
      focused: first?.focused,
      tabs: stage.group.tabIds,
    }).toStrictEqual({
      bounds: { height: 784, width: 1184, x: 8, y: 8 },
      destroyed: true,
      focused: true,
      tabs: ["t1"],
    });
  });

  it("keeps the last pane", () => {
    const { window, stages, id } = setup();
    expect(stages.close(id)).toStrictEqual({ error: "lastPane", ok: false });
    expect(window.childViews()).toHaveLength(1);
  });

  it("moves a view by removing it and inserting it again", () => {
    const { window, views, stages, stage, id } = setup();
    stages.split(id, "vertical");
    const [first, second] = views.created;
    const before = window.effects.length;

    expect(stage.setFullscreen("p1").ok).toBeTruthy();

    expect(window.childViews()).toStrictEqual([second, first]);
    expect(window.effects.slice(before)).toStrictEqual([
      { kind: "remove", view: second },
      { index: 0, kind: "add", view: second },
    ]);
    expect(first?.bounds()).toStrictEqual(window.contentBounds());
    expect(first?.radius).toBe(0);
  });

  it("follows a window resize with bounds alone", () => {
    const { window, stages, id, changes } = setup();
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

  it("resizes a split and refuses one it does not have", () => {
    const { window, stages, id } = setup();
    stages.split(id, "vertical");

    expect(stages.resize(id, "id2", 0.25).ok).toBeTruthy();
    expect(childBounds(window)[0]?.width).toBe(294);
    expect(stages.resize(id, "nope", 0.25)).toStrictEqual({
      error: "unknownSplit",
      ok: false,
    });
  });

  it("disposes every view when the window closes", () => {
    const { window, views, stages, id } = setup();
    stages.split(id, "vertical");
    stages.beginDrag(id, "id2");

    window.close();

    expect(views.created).toHaveLength(3);
    expect(views.alive).toStrictEqual([]);
    expect(stages.split(id, "vertical")).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });

  it("refuses a window it does not know", () => {
    const { stages } = setup();
    expect(stages.focusPane(-1, "p1")).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });
});

const dragging = () => {
  const context = setup();
  context.stages.split(context.id, "vertical");
  context.registrar.pushes.length = 0;
  const result = context.stages.beginDrag(context.id, "id2");
  const overlay: FakeView | undefined = context.views.created[2];
  return { ...context, overlay, result };
};

describe("the stage channels", () => {
  it("split and close the sender's window", () => {
    const { registrar, id, window } = setup();
    expect(
      registrar.call(stageChannels.split, { orientation: "horizontal" }, id)
    ).toStrictEqual({ ok: true, value: undefined });
    expect(window.childViews()).toHaveLength(2);
    expect(registrar.call(stageChannels.close, {}, id).ok).toBeTruthy();
    expect(window.childViews()).toHaveLength(1);
  });

  it("answer the snapshot a page paints first", () => {
    const { registrar, id, changes } = setup();
    expect(registrar.call(stageChannels.snapshot, {}, id)).toStrictEqual({
      ok: true,
      value: changes().at(-1),
    });
  });

  it("refuse a sender with no window", () => {
    const { registrar } = setup();
    expect(
      registrar.call(stageChannels.focusPane, { paneId: "p1" }, -1)
    ).toStrictEqual({
      error: "unknownWindow",
      ok: false,
    });
  });
});

describe("a drag across panes", () => {
  it("lets the overlay use the drag channels while it is up, and no longer", () => {
    const { registrar, overlay, window, stages, id } = dragging();
    const sender = overlay?.contentsId ?? 0;
    expect(registrar.surfaces.get(sender)).toBe(dragSurface);

    registrar.call(drag.move, { buttons: 1, x: 300, y: 5 }, sender);
    expect(childBounds(window)[0]?.width).toBe(288);
    registrar.call(drag.end, { x: 300, y: 5 }, sender);

    expect(registrar.surfaces.has(sender)).toBeFalsy();
    expect(stages.snapshot(sender).ok).toBeFalsy();
    expect(stages.snapshot(id).ok).toBeTruthy();
  });

  it("covers every pane with a transparent overlay for its duration", () => {
    const { window, overlay, views, result } = dragging();
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
      spec: { preload: "/dist/preload/drag.cjs", radius: 0 },
    });
  });

  it("moves the panes with the pointer and tells the chrome page nothing until the release", () => {
    const { window, overlay, stages, changes } = dragging();

    expect(
      stages.dragTo(overlay?.contentsId ?? 0, { x: 300, y: 400 }, 1).ok
    ).toBeTruthy();
    expect(childBounds(window)[0]?.width).toBe(288);
    expect(changes()).toStrictEqual([]);
  });

  it("removes the overlay on release and sends one snapshot", () => {
    const { window, overlay, stages, changes } = dragging();

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

  it("takes moves from the chrome page too, and ends on a move with no button held", () => {
    const { window, overlay, stages, id } = dragging();

    expect(stages.dragTo(id, { x: 500, y: 10 }, 1).ok).toBeTruthy();
    expect(stages.dragTo(id, { x: 500, y: 10 }, 0).ok).toBeTruthy();

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

  it("refuses a split the layout does not have", () => {
    const { stages, id } = setup();
    expect(stages.beginDrag(id, "id2")).toStrictEqual({
      error: "unknownSplit",
      ok: false,
    });
  });
});
