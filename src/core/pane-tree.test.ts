import { describe, expect, it } from "vitest";

import {
  PANE_GAP,
  PANE_MINIMUM,
  addPane,
  evenOut,
  paneHandles,
  paneRectangles,
  paneTabs,
  panesFit,
  readPaneTree,
  readSplit,
  removePane,
  resizePanes,
} from "./pane-tree.ts";
import type { PaneTree } from "./pane-tree.ts";

const row = (...children: [number, PaneTree][]): PaneTree => ({
  direction: "row",
  children: children.map(([size, pane]) => ({ size, pane })),
});

const column = (...children: [number, PaneTree][]): PaneTree => ({
  direction: "column",
  children: children.map(([size, pane]) => ({ size, pane })),
});

// a | b over c | d: a on the left, b above c and d side by side.
const nested = row(
  [0.5, "a"],
  [0.5, column([0.5, "b"], [0.5, row([0.5, "c"], [0.5, "d"])])]
);

const all = () => true;

describe(paneTabs, () => {
  it("reads the panes left to right and top to bottom", () => {
    expect([paneTabs("a"), paneTabs(nested)]).toStrictEqual([
      ["a"],
      ["a", "b", "c", "d"],
    ]);
  });
});

describe(addPane, () => {
  it("splits a single pane in half that way", () => {
    expect([
      addPane("a", "a", "b", "row"),
      addPane("a", "a", "b", "column"),
    ]).toStrictEqual([
      row([0.5, "a"], [0.5, "b"]),
      column([0.5, "a"], [0.5, "b"]),
    ]);
  });

  it("halves the target's share beside it in a split of that direction", () => {
    expect(addPane(row([0.6, "a"], [0.4, "b"]), "b", "c", "row")).toStrictEqual(
      row([0.6, "a"], [0.2, "b"], [0.2, "c"])
    );
  });

  it("nests a split the other way in the target's place", () => {
    expect(
      addPane(row([0.6, "a"], [0.4, "b"]), "a", "c", "column")
    ).toStrictEqual(row([0.6, column([0.5, "a"], [0.5, "c"])], [0.4, "b"]));
  });

  it("finds the target deep in the tree", () => {
    expect(addPane(nested, "d", "e", "column")).toStrictEqual(
      row(
        [0.5, "a"],
        [
          0.5,
          column(
            [0.5, "b"],
            [0.5, row([0.5, "c"], [0.5, column([0.5, "d"], [0.5, "e"])])]
          ),
        ]
      )
    );
  });

  it("leaves a tree without the target as it was", () => {
    expect(addPane(nested, "x", "e", "row")).toStrictEqual(nested);
  });
});

describe(removePane, () => {
  it("gives a removed pane's share to its siblings in proportion", () => {
    expect(
      removePane(row([0.5, "a"], [0.3, "b"], [0.2, "c"]), "a")
    ).toStrictEqual(row([0.6, "b"], [0.4, "c"]));
  });

  it("collapses a split left with one pane, joining a parent of its direction", () => {
    expect(removePane(nested, "b")).toStrictEqual(
      row([0.5, "a"], [0.25, "c"], [0.25, "d"])
    );
    expect(removePane(row([0.5, "a"], [0.5, "b"]), "a")).toBe("b");
  });

  it("ends a tree left with no pane", () => {
    expect([removePane("a", "a"), removePane("a", "b")]).toStrictEqual([
      undefined,
      "a",
    ]);
  });
});

describe(paneRectangles, () => {
  const area = { x: 10, y: 20, width: 1001, height: 700 };

  it("cuts the area by the shares with the gaps between, filling it exactly", () => {
    const rectangles = paneRectangles(
      row([1 / 3, "a"], [1 / 3, "b"], [1 / 3, "c"]),
      area
    );
    const widths = rectangles.map(({ bounds }) => bounds.width);

    expect([rectangles.map(({ bounds }) => bounds.x), widths]).toStrictEqual([
      [10, 10 + 328 + PANE_GAP, 10 + 328 + 329 + 2 * PANE_GAP],
      [328, 329, 328],
    ]);
    expect(widths.reduce((sum, width) => sum + width) + 2 * PANE_GAP).toBe(
      area.width
    );
    expect(
      rectangles.every(
        ({ bounds }) => bounds.y === area.y && bounds.height === area.height
      )
    ).toBeTruthy();
  });

  it("places nested panes in reading order", () => {
    expect(
      paneRectangles(nested, { x: 0, y: 0, width: 1008, height: 708 })
    ).toStrictEqual([
      { tabId: "a", bounds: { x: 0, y: 0, width: 500, height: 708 } },
      { tabId: "b", bounds: { x: 508, y: 0, width: 500, height: 350 } },
      { tabId: "c", bounds: { x: 508, y: 358, width: 246, height: 350 } },
      { tabId: "d", bounds: { x: 762, y: 358, width: 246, height: 350 } },
    ]);
  });

  it("gives a single pane the whole area", () => {
    expect(paneRectangles("a", area)).toStrictEqual([
      { tabId: "a", bounds: area },
    ]);
  });
});

describe(panesFit, () => {
  it("needs every pane at least the minimum each way", () => {
    const two = row([0.5, "a"], [0.5, "b"]);
    const wide = 2 * PANE_MINIMUM + PANE_GAP;

    expect([
      panesFit(two, { width: wide, height: PANE_MINIMUM }),
      panesFit(two, { width: wide - 1, height: PANE_MINIMUM }),
      panesFit(two, { width: wide, height: PANE_MINIMUM - 1 }),
    ]).toStrictEqual([true, false, false]);
  });
});

describe(readPaneTree, () => {
  it("reads back what it stored", () => {
    expect(readPaneTree(structuredClone(nested), all)).toStrictEqual(nested);
  });

  it("removes a pane whose tab is gone or repeats one, its share going to the rest", () => {
    expect(
      readPaneTree(
        row([0.5, "a"], [0.25, "gone"], [0.25, "a"]),
        (tabId) => tabId !== "gone"
      )
    ).toBe("a");
    expect(
      readPaneTree(
        row([0.5, "a"], [0.25, "gone"], [0.25, "b"]),
        (tabId) => tabId !== "gone"
      )
    ).toStrictEqual(row([2 / 3, "a"], [1 / 3, "b"]));
    expect(readPaneTree(row([1, "gone"]), () => false)).toBe("none left");
  });

  it("refuses what is no tree", () => {
    expect(
      [
        undefined,
        3,
        { direction: "diagonal", children: [] },
        { direction: "row", children: [{ size: -1, pane: "a" }] },
        { direction: "row", children: [{ size: 1, pane: 2 }] },
      ].map((value) => readPaneTree(value, all))
    ).toStrictEqual([undefined, undefined, undefined, undefined, undefined]);
  });
});

describe(readSplit, () => {
  const root = row([0.5, "a"], [0.5, "b"]);

  it("keeps any key it does not know", () => {
    expect(readSplit({ root, later: true }, all)).toStrictEqual({
      kind: "split",
      split: { root, later: true },
    });
  });

  it("ends a split left with one pane, and keeps what is no split as found", () => {
    expect([
      readSplit({ root }, (tabId) => tabId === "a"),
      readSplit("split", all),
      readSplit({ root: 3 }, all),
    ]).toStrictEqual([
      { kind: "none" },
      { kind: "as-found" },
      { kind: "as-found" },
    ]);
  });
});

const sizes = (tree: PaneTree): unknown =>
  typeof tree === "string"
    ? tree
    : tree.children.map((child) => [child.size, sizes(child.pane)]);

describe(paneHandles, () => {
  it("puts a handle in each gap, outer splits first, named by the first tab on each side", () => {
    const handles = paneHandles(nested, {
      x: 0,
      y: 0,
      width: 1008,
      height: 708,
    });

    expect(
      handles.map(({ before, after, direction, bounds }) => ({
        before,
        after,
        direction,
        bounds,
      }))
    ).toStrictEqual([
      {
        before: "a",
        after: "b",
        direction: "row",
        bounds: { x: 500, y: 0, width: PANE_GAP, height: 708 },
      },
      {
        before: "b",
        after: "c",
        direction: "column",
        bounds: { x: 508, y: 350, width: 500, height: PANE_GAP },
      },
      {
        before: "c",
        after: "d",
        direction: "row",
        bounds: { x: 754, y: 358, width: PANE_GAP, height: 350 },
      },
    ]);
  });

  it("lets a side shrink to the least its own panes take", () => {
    const [outer] = paneHandles(nested, {
      x: 0,
      y: 0,
      width: 1008,
      height: 708,
    });

    expect(outer).toMatchObject({
      size: 500,
      span: 1000,
      minimum: PANE_MINIMUM,
      maximum: 1000 - (2 * PANE_MINIMUM + PANE_GAP),
    });
  });

  it("never makes a side already under its minimum any smaller", () => {
    const [handle] = paneHandles(row([0.5, "a"], [0.5, "b"]), {
      x: 0,
      y: 0,
      width: 308,
      height: 400,
    });

    expect(handle).toMatchObject({ size: 150, minimum: 150, maximum: 150 });
  });
});

const two = row([0.5, "a"], [0.5, "b"]);
const size = { width: 1008, height: 700 };

/** The two panes' widths once the gap between them moved `by`. */
const widthsAfter = (by: number) =>
  paneRectangles(resizePanes(two, size, "a", "b", by), {
    x: 0,
    y: 0,
    ...size,
  }).map(({ bounds }) => bounds.width);

describe(resizePanes, () => {
  it("moves the gap between two panes and shares their space anew", () => {
    expect(sizes(resizePanes(two, size, "a", "b", 100))).toStrictEqual([
      [0.6, "a"],
      [0.4, "b"],
    ]);
  });

  it("moves a pane against a nested split, whose own shares stay", () => {
    const moved = resizePanes(nested, size, "a", "b", -100);

    expect(sizes(moved)).toStrictEqual([
      [0.4, "a"],
      [
        0.6,
        [
          [0.5, "b"],
          [
            0.5,
            [
              [0.5, "c"],
              [0.5, "d"],
            ],
          ],
        ],
      ],
    ]);
  });

  it("stops at each side's minimum", () => {
    expect([widthsAfter(-1000), widthsAfter(1000)]).toStrictEqual([
      [PANE_MINIMUM, 1000 - PANE_MINIMUM],
      [1000 - PANE_MINIMUM, PANE_MINIMUM],
    ]);
  });

  it("keeps a nested split's every pane at the minimum with its own shares uneven, however the gaps are moved in turn", () => {
    const wide = { width: 1600, height: 900 };
    const widths = (tree: PaneTree) =>
      paneRectangles(tree, { x: 0, y: 0, ...wide }).map(
        ({ tabId, bounds }) => [tabId, bounds.width] as const
      );
    // C|D first, to D's minimum, which leaves the inner shares uneven.
    const inner = resizePanes(nested, wide, "c", "d", 4000);
    const outer = resizePanes(inner, wide, "a", "b", 4000);

    expect(Object.fromEntries(widths(inner)).d).toBe(PANE_MINIMUM);
    expect(
      widths(outer).every(([, width]) => width >= PANE_MINIMUM)
    ).toBeTruthy();
    expect(Object.fromEntries(widths(outer)).d).toBe(PANE_MINIMUM);
  });

  it("in a window already too small, keeps the shares and refuses to shrink a pane further", () => {
    const small = { width: 408, height: 300 };
    const uneven = row([0.4, "a"], [0.6, "b"]);

    expect([
      sizes(resizePanes(uneven, small, "a", "b", -50)),
      sizes(resizePanes(uneven, small, "a", "b", 50)),
    ]).toStrictEqual([sizes(uneven), sizes(uneven)]);
  });

  it("leaves a tree without such a gap as it is", () => {
    expect([
      resizePanes(two, size, "b", "a", 50),
      resizePanes(nested, size, "a", "c", 50),
    ]).toStrictEqual([two, nested]);
  });
});

describe(evenOut, () => {
  it("gives the children of the split where the two part equal shares, the rest kept", () => {
    const uneven = row(
      [0.2, "a"],
      [0.8, column([0.7, "b"], [0.3, row([0.9, "c"], [0.1, "d"])])]
    );

    expect([
      sizes(evenOut(uneven, "a", "b")),
      sizes(evenOut(uneven, "c", "d")),
    ]).toStrictEqual([
      [
        [0.5, "a"],
        [
          0.5,
          [
            [0.7, "b"],
            [
              0.3,
              [
                [0.9, "c"],
                [0.1, "d"],
              ],
            ],
          ],
        ],
      ],
      [
        [0.2, "a"],
        [
          0.8,
          [
            [0.7, "b"],
            [
              0.3,
              [
                [0.5, "c"],
                [0.5, "d"],
              ],
            ],
          ],
        ],
      ],
    ]);
  });
});
