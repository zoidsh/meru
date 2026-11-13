import { describe, expect, it } from "vitest";

import { layoutSchema } from "../records/layout.ts";
import type { Layout, LayoutNode, Split } from "../records/layout.ts";
import type { Rect } from "../records/rect.ts";
import type { Style } from "../records/style.ts";
import {
  close,
  focusNext,
  focusPrevious,
  layout,
  NO_FLUSH,
  leaf,
  MAX_RATIO,
  MIN_RATIO,
  panes,
  ratioAt,
  resize,
  split,
  STYLE_METRICS,
} from "./layout.ts";

// Park and Miller's minimal standard generator: seeded, so a failing case is the same case on every run.
const random = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};

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
    const result = split(tree, target, orientation, ids(), ids);
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
    const result = split(leaf("p1", "t1"), "p1", "vertical", "t2", ids);
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

describe(split, () => {
  it.each(cases)(
    "then close gives back the tree (seed $seed)",
    ({ tree, draw }) => {
      const pane = pick(draw, panes(tree)).paneId;
      const result = split(tree, pane, "horizontal", "new-tab", counter("new"));
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
      "vertical",
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

  it("refuses a pane the layout does not have", () => {
    expect(
      split(leaf("p1", "t1"), "p9", "vertical", "t2", counter("id"))
    ).toBeUndefined();
    expect(split(null, "p1", "vertical", "t2", counter("id"))).toBeUndefined();
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
      "vertical",
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
