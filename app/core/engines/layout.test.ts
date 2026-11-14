import { describe, expect, it } from "vitest";

import { random } from "../../test/random.ts";
import { layoutSchema } from "../records/layout.ts";
import type {
  Beside,
  Layout,
  Leaf,
  LayoutNode,
  Split,
} from "../records/layout.ts";
import type { Rect } from "../records/rect.ts";
import type { Style } from "../records/style.ts";
import {
  equalise,
  dropTargetAt,
  dropZoneAt,
  placementOf,
  close,
  dropRect,
  focusNext,
  focusPrevious,
  layout,
  NO_FLUSH,
  leaf,
  MAX_RATIO,
  MIN_RATIO,
  paneOfTab,
  panes,
  movePane,
  ratioAt,
  resize,
  shownLayout,
  split,
  STYLE_METRICS,
  swap,
  tabOfPane,
} from "./layout.ts";

const counter = (prefix: string) => {
  let count = 0;
  return () => {
    count += 1;
    return `${prefix}${count}`;
  };
};

const splits = (tree: Layout): Split[] =>
  tree === null || tree.kind === "leaf"
    ? []
    : [tree, ...splits(tree.first), ...splits(tree.second)];

interface Case {
  readonly seed: number;
  readonly tree: LayoutNode;
  readonly rect: Rect;
  readonly style: Style;
  readonly draw: () => number;
}

const pick = <T>(draw: () => number, items: readonly T[]): T => {
  const item = items[Math.floor(draw() * items.length)];
  if (item === undefined) {
    throw new Error("pick from an empty list");
  }
  return item;
};

const generate = (seed: number): Case => {
  const draw = random(seed);
  const ids = counter(`s${seed}-`);
  let tree: LayoutNode = leaf(ids(), ids());
  const count = Math.floor(draw() * 8);
  for (let index = 0; index < count; index += 1) {
    const target = pick(draw, panes(tree)).paneId;
    const orientation = draw() < 0.5 ? "vertical" : "horizontal";
    const side = draw() < 0.5 ? "before" : "after";
    const result = split(tree, target, { orientation, side }, ids(), ids);
    if (result === undefined) {
      throw new Error("split lost a pane it was given");
    }
    tree = result.layout;
  }
  for (const node of splits(tree)) {
    const resized = resize(tree, node.id, draw());
    if (resized === null) {
      throw new Error("resize emptied a layout");
    }
    tree = resized;
  }
  const rect = {
    height: 200 + Math.floor(draw() * 1800),
    width: 200 + Math.floor(draw() * 2800),
    x: Math.floor(draw() * 300),
    y: Math.floor(draw() * 300),
  };
  return {
    draw,
    rect,
    seed,
    style: draw() < 0.5 ? "modern" : "classic",
    tree,
  };
};

const cases = Array.from({ length: 300 }, (_, seed) => generate(seed + 1));

const area = (rect: Rect) => rect.width * rect.height;

const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const insetRect = (rect: Rect, style: Style): Rect => {
  const by = STYLE_METRICS[style].inset;
  return {
    height: rect.height - 2 * by,
    width: rect.width - 2 * by,
    x: rect.x + by,
    y: rect.y + by,
  };
};

const pieces = (arrangement: ReturnType<typeof layout>) => [
  ...arrangement.panes.values(),
  ...arrangement.dividers.map((divider) => divider.rect),
];

describe(layout, () => {
  it.each(cases)(
    "tiles the content area, less the inset, with panes and dividers (seed $seed)",
    ({ tree, rect, style }) => {
      const arrangement = layout(tree, rect, style);
      const content = insetRect(rect, style);
      const all = pieces(arrangement);

      expect(all.reduce((sum, piece) => sum + area(piece), 0)).toBe(
        area(content)
      );
      for (const piece of all) {
        expect(overlap(piece, content)).toBe(area(piece));
        expect(
          [piece.x, piece.y, piece.width, piece.height].every((value) =>
            Number.isInteger(value)
          )
        ).toBeTruthy();
      }
      for (const [index, a] of all.entries()) {
        for (const b of all.slice(index + 1)) {
          expect(overlap(a, b)).toBe(0);
        }
      }
    }
  );

  it.each(cases)(
    "gives every pane a rect (seed $seed)",
    ({ tree, rect, style }) => {
      const arrangement = layout(tree, rect, style);
      expect([...arrangement.panes.keys()]).toStrictEqual(
        panes(tree).map((pane) => pane.paneId)
      );
      expect(
        arrangement.dividers.map((divider) => divider.splitId)
      ).toStrictEqual(splits(tree).map((node) => node.id));
    }
  );

  it.each(cases)(
    "gives a fullscreen pane the whole rect and hides the rest (seed $seed)",
    ({ tree, rect, style, draw }) => {
      const pane = pick(draw, panes(tree)).paneId;
      const arrangement = layout(tree, rect, style, NO_FLUSH, pane);
      expect([...arrangement.panes]).toStrictEqual([[pane, rect]]);
      expect(arrangement.dividers).toStrictEqual([]);
    }
  );

  it.each(["modern", "classic"] as const)(
    "fills the content area with one pane in %s",
    (style) => {
      const rect = { height: 700, width: 1000, x: 20, y: 30 };
      expect(
        layout(leaf("p1", "t1"), rect, style).panes.get("p1")
      ).toStrictEqual(insetRect(rect, style));
    }
  );

  it("keeps no inset on a flush side, where the panes meet the chrome", () => {
    const rect = { height: 600, width: 1000, x: 0, y: 0 };
    expect(
      layout(leaf("p1", "t1"), rect, "modern", {
        left: true,
        top: true,
      }).panes.get("p1")
    ).toStrictEqual({ height: 592, width: 992, x: 0, y: 0 });
    expect(
      layout(leaf("p1", "t1"), rect, "modern", {
        left: false,
        top: true,
      }).panes.get("p1")
    ).toStrictEqual({ height: 592, width: 984, x: 8, y: 0 });
    expect(
      layout(leaf("p1", "t1"), rect, "classic", {
        left: true,
        top: true,
      }).panes.get("p1")
    ).toStrictEqual(rect);
  });

  it("draws classic edge to edge and modern inset", () => {
    const rect = { height: 600, width: 1000, x: 0, y: 0 };
    expect(
      layout(leaf("p1", "t1"), rect, "classic").panes.get("p1")
    ).toStrictEqual(rect);
    expect(
      layout(leaf("p1", "t1"), rect, "modern").panes.get("p1")
    ).toStrictEqual({
      height: 584,
      width: 984,
      x: 8,
      y: 8,
    });
  });

  it("rounds the first side and gives the second the remainder", () => {
    const ids = counter("id");
    const result = split(
      leaf("p1", "t1"),
      "p1",
      { orientation: "vertical", side: "after" },
      "t2",
      ids
    );
    const rect = { height: 50, width: 100, x: 0, y: 0 };
    const arrangement = layout(result?.layout ?? null, rect, "classic");
    // 99 pixels to share at 0.5: the first side rounds 49.5 up to 50, the second keeps 49.
    expect(arrangement.panes.get("p1")).toStrictEqual({
      height: 50,
      width: 50,
      x: 0,
      y: 0,
    });
    expect(arrangement.dividers[0]?.rect).toStrictEqual({
      height: 50,
      width: 1,
      x: 50,
      y: 0,
    });
    expect(arrangement.panes.get(result?.paneId ?? "")).toStrictEqual({
      height: 50,
      width: 49,
      x: 51,
      y: 0,
    });
  });

  it("lays out nothing for the empty layout", () => {
    const arrangement = layout(
      null,
      { height: 10, width: 10, x: 0, y: 0 },
      "modern"
    );
    expect(arrangement.panes.size).toBe(0);
    expect(arrangement.dividers).toStrictEqual([]);
  });

  it("keeps tiling a rect smaller than its gaps", () => {
    const { tree } = generate(7);
    const rect = { height: 3, width: 5, x: 0, y: 0 };
    const content = layout(leaf("p1", "t1"), rect, "modern").panes.get("p1");
    const all = pieces(layout(tree, rect, "modern"));
    expect(all.reduce((sum, piece) => sum + area(piece), 0)).toBe(
      content === undefined ? -1 : area(content)
    );
    for (const piece of all) {
      expect(Math.min(piece.width, piece.height)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("paneOfTab and tabOfPane", () => {
  it.each(cases)(
    "answer each other for every pane (seed $seed)",
    ({ tree }) => {
      for (const { paneId, tabIds } of panes(tree)) {
        const [tabId = ""] = tabIds;
        expect([tabOfPane(tree, paneId), paneOfTab(tree, tabId)]).toStrictEqual(
          [tabId, paneId]
        );
      }
    }
  );

  it("know nothing of a pane or tab the layout does not show", () => {
    expect([
      tabOfPane(leaf("p1", "t1"), "p9"),
      paneOfTab(leaf("p1", "t1"), "t9"),
      tabOfPane(null, "p1"),
      paneOfTab(null, "t1"),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });
});

describe(split, () => {
  it.each(cases)(
    "then close gives back the tree (seed $seed)",
    ({ tree, draw }) => {
      const pane = pick(draw, panes(tree)).paneId;
      const result = split(
        tree,
        pane,
        { orientation: "horizontal", side: "after" },
        "new-tab",
        counter("new")
      );
      expect(result).toBeDefined();
      expect(panes(result?.layout ?? null)).toHaveLength(
        panes(tree).length + 1
      );
      expect(close(result?.layout ?? null, result?.paneId ?? "")).toStrictEqual(
        tree
      );
    }
  );

  it("puts the new pane after the one split, with an even ratio", () => {
    const result = split(
      leaf("p1", "t1"),
      "p1",
      { orientation: "vertical", side: "after" },
      "t2",
      counter("id")
    );
    expect(result).toStrictEqual({
      layout: {
        first: leaf("p1", "t1"),
        id: "id1",
        kind: "split",
        orientation: "vertical",
        ratio: 0.5,
        second: leaf("id2", "t2"),
      },
      paneId: "id2",
    });
  });

  it("puts the new pane before the one split, above it when stacked", () => {
    const result = split(
      leaf("p1", "t1"),
      "p1",
      { orientation: "horizontal", side: "before" },
      "t2",
      counter("id")
    );
    expect(result).toStrictEqual({
      layout: {
        first: leaf("id2", "t2"),
        id: "id1",
        kind: "split",
        orientation: "horizontal",
        ratio: 0.5,
        second: leaf("p1", "t1"),
      },
      paneId: "id2",
    });
  });

  it("refuses a pane the layout does not have", () => {
    expect(
      split(
        leaf("p1", "t1"),
        "p9",
        { orientation: "vertical", side: "after" },
        "t2",
        counter("id")
      )
    ).toBeUndefined();
    expect(
      split(
        null,
        "p1",
        { orientation: "vertical", side: "after" },
        "t2",
        counter("id")
      )
    ).toBeUndefined();
  });
});

describe(close, () => {
  it("returns the empty layout for the last pane", () => {
    expect(close(leaf("p1", "t1"), "p1")).toBeNull();
  });

  it.each(cases)(
    "removes one pane and keeps the others in order (seed $seed)",
    ({ tree, draw }) => {
      const pane = pick(draw, panes(tree)).paneId;
      const remaining = panes(tree).filter((node) => node.paneId !== pane);
      expect(panes(close(tree, pane))).toStrictEqual(remaining);
    }
  );

  it("leaves the tree alone for a pane it does not have", () => {
    const tree = leaf("p1", "t1");
    expect(close(tree, "p9")).toBe(tree);
  });
});

describe(resize, () => {
  it.each(cases)(
    "round-trips a ratio through the tree and its schema (seed $seed)",
    ({ tree, draw }) => {
      for (const node of splits(tree)) {
        const ratio = MIN_RATIO + draw() * (MAX_RATIO - MIN_RATIO);
        const resized = resize(tree, node.id, ratio);
        // Through JSON text, as state is persisted.
        const text = JSON.stringify(resized);
        const parsed = layoutSchema.parse(JSON.parse(text));
        expect(
          splits(parsed).find((found) => found.id === node.id)?.ratio
        ).toBe(ratio);
      }
    }
  );

  it("clamps a ratio so neither side vanishes", () => {
    const result = split(
      leaf("p1", "t1"),
      "p1",
      { orientation: "vertical", side: "after" },
      "t2",
      counter("id")
    );
    const tree = result?.layout ?? null;
    expect(splits(resize(tree, "id1", 0))[0]?.ratio).toBe(MIN_RATIO);
    expect(splits(resize(tree, "id1", 2))[0]?.ratio).toBe(MAX_RATIO);
  });

  it("leaves the tree alone for a split it does not have", () => {
    const tree = leaf("p1", "t1");
    expect(resize(tree, "s9", 0.3)).toBe(tree);
  });
});

describe(ratioAt, () => {
  it.each(cases)(
    "puts the divider back where it was drawn (seed $seed)",
    ({ tree, rect, style }) => {
      const arrangement = layout(tree, rect, style);
      for (const divider of arrangement.dividers) {
        const center = {
          x: divider.rect.x + divider.rect.width / 2,
          y: divider.rect.y + divider.rect.height / 2,
        };
        const ratio = ratioAt(tree, rect, style, divider.splitId, center);
        const redrawn = layout(
          resize(tree, divider.splitId, ratio ?? 0),
          rect,
          style
        );
        expect(
          redrawn.dividers.find((found) => found.splitId === divider.splitId)
            ?.rect
        ).toStrictEqual(divider.rect);
      }
    }
  );

  it("knows nothing of a split it does not have", () => {
    const rect = { height: 10, width: 10, x: 0, y: 0 };
    expect(
      ratioAt(leaf("p1", "t1"), rect, "modern", "s1", { x: 1, y: 1 })
    ).toBeUndefined();
  });
});

describe(focusNext, () => {
  it.each(cases)("visits every pane and wraps (seed $seed)", ({ tree }) => {
    const order = panes(tree).map((pane) => pane.paneId);
    const first = order[0] ?? "";
    const seen = [first];
    let current = focusNext(tree, first);
    while (current !== undefined && current !== first) {
      seen.push(current);
      current = focusNext(tree, current);
    }
    expect(seen).toStrictEqual(order);
  });

  it("has nothing to focus in the empty layout", () => {
    expect(focusNext(null, "p1")).toBeUndefined();
  });
});

describe(focusPrevious, () => {
  it.each(cases)(
    "visits every pane in reverse and wraps (seed $seed)",
    ({ tree }) => {
      const order = panes(tree).map((pane) => pane.paneId);
      const first = order[0] ?? "";
      const seen = [first];
      let current = focusPrevious(tree, first);
      while (current !== undefined && current !== first) {
        seen.push(current);
        current = focusPrevious(tree, current);
      }
      expect(seen).toStrictEqual([first, ...order.slice(1).toReversed()]);
    }
  );

  it("undoes focusNext", () => {
    for (const { tree } of cases) {
      for (const { paneId } of panes(tree)) {
        const next = focusNext(tree, paneId) ?? "";
        expect(focusPrevious(tree, next)).toBe(paneId);
      }
    }
  });

  it("has nothing to focus in the empty layout", () => {
    expect(focusPrevious(null, "p1")).toBeUndefined();
  });
});

const leafSet = (tree: Layout) =>
  panes(tree)
    .map((pane) => `${pane.paneId}:${pane.tabIds.join(",")}`)
    .toSorted();

const idsOf = (tree: Layout) => [
  ...panes(tree).map((pane) => pane.paneId),
  ...splits(tree).map((node) => node.id),
];

/** Two different panes of a layout that has at least two. */
const twoPanes = (draw: () => number, tree: Layout): [Leaf, Leaf] => {
  const first = pick(draw, panes(tree));
  const second = pick(
    draw,
    panes(tree).filter((pane) => pane.paneId !== first.paneId)
  );
  return [first, second];
};

const tilesExactly = (tree: Layout, rect: Rect, style: Style) => {
  const all = pieces(layout(tree, rect, style));
  return (
    all.reduce((sum, piece) => sum + area(piece), 0) ===
    area(insetRect(rect, style))
  );
};

describe(movePane, () => {
  it.each(cases.filter(({ tree }) => panes(tree).length > 1))(
    "keeps every pane, its tabs and every id, lands the pane on the side asked, and still tiles (seed $seed)",
    ({ tree, rect, style, draw }) => {
      const [moving, target] = twoPanes(draw, tree);
      const beside: Beside = {
        orientation: draw() < 0.5 ? "vertical" : "horizontal",
        side: draw() < 0.5 ? "before" : "after",
      };
      const moved = movePane(tree, moving.paneId, target.paneId, beside);
      const order = panes(moved ?? null).map((pane) => pane.paneId);
      const at = order.indexOf(moving.paneId);
      expect({
        ids: idsOf(moved ?? null).toSorted(),
        leaves: leafSet(moved ?? null),
        neighbour: order[beside.side === "before" ? at + 1 : at - 1],
        tiles: tilesExactly(moved ?? null, rect, style),
      }).toStrictEqual({
        ids: idsOf(tree).toSorted(),
        leaves: leafSet(tree),
        neighbour: target.paneId,
        tiles: true,
      });
    }
  );

  it("puts the pane before the target, reusing the split it left", () => {
    const tree: LayoutNode = {
      first: leaf("p1", "t1"),
      id: "s1",
      kind: "split",
      orientation: "vertical",
      ratio: 0.3,
      second: {
        first: leaf("p2", "t2"),
        id: "s2",
        kind: "split",
        orientation: "horizontal",
        ratio: 0.5,
        second: leaf("p3", "t3"),
      },
    };
    expect(
      movePane(tree, "p3", "p1", { orientation: "horizontal", side: "before" })
    ).toStrictEqual({
      first: {
        first: leaf("p3", "t3"),
        id: "s2",
        kind: "split",
        orientation: "horizontal",
        ratio: 0.5,
        second: leaf("p1", "t1"),
      },
      id: "s1",
      kind: "split",
      orientation: "vertical",
      ratio: 0.3,
      second: leaf("p2", "t2"),
    });
  });

  it("refuses a pane that is alone, missing or its own target", () => {
    const beside: Beside = { orientation: "vertical", side: "after" };
    const pair = split(leaf("p1", "t1"), "p1", beside, "t2", counter("id"));
    const tree = pair?.layout ?? null;
    expect([
      movePane(leaf("p1", "t1"), "p1", "p1", beside),
      movePane(tree, "p1", "p1", beside),
      movePane(tree, "p9", "p1", beside),
      movePane(tree, "p1", "p9", beside),
      movePane(null, "p1", "p2", beside),
    ]).toStrictEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe(swap, () => {
  it.each(cases.filter(({ tree }) => panes(tree).length > 1))(
    "trades the two panes' places, leaves the rest and still tiles (seed $seed)",
    ({ tree, rect, style, draw }) => {
      const order = panes(tree);
      const [a, b] = twoPanes(draw, tree);
      const swapped = swap(tree, a.paneId, b.paneId);
      expect(swap(tree, a.paneId, a.paneId)).toBeUndefined();
      expect(panes(swapped ?? null)).toStrictEqual(
        order.map((pane) => {
          if (pane.paneId === a.paneId) {
            return b;
          }
          return pane.paneId === b.paneId ? a : pane;
        })
      );
      expect(splits(swapped ?? null)).toHaveLength(splits(tree).length);
      expect(tilesExactly(swapped ?? null, rect, style)).toBeTruthy();
      expect(swap(swapped ?? null, a.paneId, b.paneId)).toStrictEqual(tree);
    }
  );

  it("refuses a pane the layout does not have", () => {
    expect(swap(leaf("p1", "t1"), "p1", "p9")).toBeUndefined();
  });
});

describe(equalise, () => {
  it("gives each pane of a run of one orientation an equal share", () => {
    const ids = counter("id");
    const beside: Beside = { orientation: "vertical", side: "after" };
    const pair = split(leaf("p1", "t1"), "p1", beside, "t2", ids);
    const tree =
      split(pair?.layout ?? null, pair?.paneId ?? "", beside, "t3", ids)
        ?.layout ?? null;
    const rect = { height: 300, width: 900, x: 0, y: 0 };
    const widths = [
      ...layout(equalise(tree), rect, "classic").panes.values(),
    ].map((pane) => pane.width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  });

  it.each(cases)(
    "keeps the panes and the splits and still tiles (seed $seed)",
    ({ tree, rect, style }) => {
      const equalised = equalise(tree);
      expect({
        ids: idsOf(equalised),
        leaves: leafSet(equalised),
        tiles: tilesExactly(equalised, rect, style),
      }).toStrictEqual({
        ids: idsOf(tree),
        leaves: leafSet(tree),
        tiles: true,
      });
    }
  );

  it.each(cases)(
    "keeps every ratio within MIN_RATIO and MAX_RATIO and changes nothing a second time (seed $seed)",
    ({ tree }) => {
      const equalised = equalise(tree);
      expect(
        splits(equalised).filter(
          ({ ratio }) => ratio < MIN_RATIO || ratio > MAX_RATIO
        )
      ).toStrictEqual([]);
      expect(equalise(equalised)).toStrictEqual(equalised);
    }
  );

  it("keeps a run of more panes than even shares within MIN_RATIO allow inside the bounds", () => {
    const ids = counter("id");
    const beside: Beside = { orientation: "vertical", side: "after" };
    let tree: Layout = leaf("p1", "t1");
    let last = "p1";
    for (let index = 2; index <= 14; index += 1) {
      const result = split(tree, last, beside, `t${index}`, ids);
      tree = result?.layout ?? tree;
      last = result?.paneId ?? last;
    }
    expect(panes(tree)).toHaveLength(14);
    expect(
      splits(equalise(tree)).filter(
        ({ ratio }) => ratio < MIN_RATIO || ratio > MAX_RATIO
      )
    ).toStrictEqual([]);
  });
});

describe(dropZoneAt, () => {
  const rect = { height: 500, width: 1000, x: 100, y: 50 };

  it("takes the outer fifth by each edge for that edge and the middle for a join", () => {
    expect(
      [
        { x: 101, y: 300 },
        { x: 1099, y: 300 },
        { x: 600, y: 51 },
        { x: 600, y: 549 },
        { x: 600, y: 300 },
        { x: 299, y: 300 },
        { x: 300, y: 300 },
      ].map((point) => dropZoneAt(rect, point))
    ).toStrictEqual([
      "left",
      "right",
      "top",
      "bottom",
      "centre",
      "left",
      "centre",
    ]);
  });

  it("gives a corner to the edge the point is nearer, by share of the pane", () => {
    expect([
      dropZoneAt(rect, { x: 110, y: 90 }),
      dropZoneAt(rect, { x: 150, y: 60 }),
    ]).toStrictEqual(["left", "top"]);
  });

  it("answers nothing outside the pane or for an empty one", () => {
    expect([
      dropZoneAt(rect, { x: 99, y: 300 }),
      dropZoneAt(rect, { x: 1100, y: 300 }),
      dropZoneAt(rect, { x: 600, y: 550 }),
      dropZoneAt({ ...rect, width: 0 }, { x: 100, y: 300 }),
    ]).toStrictEqual([undefined, undefined, undefined, undefined]);
  });

  it.each(cases)(
    "finds every point of a pane in exactly one pane and the drop rect inside it (seed $seed)",
    ({ tree, rect: bounds, style, draw }) => {
      const arrangement = layout(tree, bounds, style);
      const point = {
        x: bounds.x + Math.floor(draw() * bounds.width),
        y: bounds.y + Math.floor(draw() * bounds.height),
      };
      const hits = [...arrangement.panes.values()].flatMap((pane) => {
        const zone = dropZoneAt(pane, point);
        return zone === undefined ? [] : [{ pane, zone }];
      });
      expect(hits.length).toBeLessThanOrEqual(1);
      for (const { pane, zone } of hits) {
        expect(overlap(dropRect(pane, zone), pane)).toBe(
          area(dropRect(pane, zone))
        );
      }
    }
  );
});

describe(placementOf, () => {
  it("puts left and top before, right and bottom after, and a join beside", () => {
    expect(
      (["left", "right", "top", "bottom", "centre"] as const).map(placementOf)
    ).toStrictEqual([
      { orientation: "vertical", side: "before" },
      { orientation: "vertical", side: "after" },
      { orientation: "horizontal", side: "before" },
      { orientation: "horizontal", side: "after" },
      { orientation: "vertical", side: "after" },
    ]);
  });
});

describe(dropRect, () => {
  it("takes the half by the edge, or the whole pane for a join", () => {
    const rect = { height: 301, width: 801, x: 10, y: 20 };
    expect(
      (["left", "right", "top", "bottom", "centre"] as const).map((zone) =>
        dropRect(rect, zone)
      )
    ).toStrictEqual([
      { height: 301, width: 401, x: 10, y: 20 },
      { height: 301, width: 400, x: 411, y: 20 },
      { height: 151, width: 801, x: 10, y: 20 },
      { height: 150, width: 801, x: 10, y: 171 },
      rect,
    ]);
  });
});

const tabOf = (pane: Leaf) => pane.tabIds[0];

describe(shownLayout, () => {
  const none = { drag: undefined, fullscreen: undefined, maximised: undefined };

  it.each(cases)(
    "shows the layout whole with nothing maximised or fullscreen (seed $seed)",
    ({ tree }) => {
      expect(shownLayout(tree, none)).toBe(tree);
    }
  );

  it.each(cases)(
    "shows only the maximised tab's pane, and only the fullscreen tab's over it (seed $seed)",
    ({ tree, draw }) => {
      const maximised = pick(draw, panes(tree));
      const fullscreen = pick(draw, panes(tree));
      expect([
        shownLayout(tree, { ...none, maximised: tabOf(maximised) }),
        shownLayout(tree, {
          ...none,
          fullscreen: tabOf(fullscreen),
          maximised: tabOf(maximised),
        }),
      ]).toStrictEqual([maximised, fullscreen]);
    }
  );

  it("shows the drag's layout, and ignores a tab the layout does not hold", () => {
    const tree =
      split(
        leaf("p1", "t1"),
        "p1",
        { orientation: "vertical", side: "after" },
        "t2",
        counter("id")
      )?.layout ?? null;
    const dragged = resize(tree, "id1", 0.3);
    expect(
      shownLayout(tree, { drag: dragged, fullscreen: "t9", maximised: "t8" })
    ).toBe(dragged);
  });
});

describe(dropTargetAt, () => {
  const left = { height: 400, width: 300, x: 0, y: 0 };
  const right = { height: 400, width: 300, x: 300, y: 0 };
  const shown = [
    { rect: left, tabId: "mail" },
    { rect: right, tabId: "calendar" },
  ];

  it("takes the half of the pane by the edge the point is near, and the whole pane in its middle", () => {
    expect([
      dropTargetAt(shown, { x: 20, y: 200 }, "drive"),
      dropTargetAt(shown, { x: 450, y: 200 }, "drive"),
    ]).toStrictEqual([
      { rect: { ...left, width: 150 }, tabId: "mail", zone: "left" },
      { rect: right, tabId: "calendar", zone: "centre" },
    ]);
  });

  it("lands a drop on a pinned pane's left or top fifth on its right or bottom half, so the pinned tab stays first", () => {
    const pinned = [{ ...shown[0], pinned: true, rect: left, tabId: "mail" }];
    expect([
      dropTargetAt(pinned, { x: 20, y: 200 }, "drive"),
      dropTargetAt(pinned, { x: 150, y: 20 }, "drive"),
      dropTargetAt(pinned, { x: 150, y: 200 }, "drive")?.zone,
    ]).toStrictEqual([
      {
        rect: { ...left, width: 150, x: 150 },
        tabId: "mail",
        zone: "right",
      },
      {
        rect: { ...left, height: 200, y: 200 },
        tabId: "mail",
        zone: "bottom",
      },
      "centre",
    ]);
  });

  it("finds nothing over the dragged tab's own pane or off every pane", () => {
    expect([
      dropTargetAt(shown, { x: 20, y: 200 }, "mail"),
      dropTargetAt(shown, { x: 700, y: 200 }, "drive"),
    ]).toStrictEqual([undefined, undefined]);
  });
});
