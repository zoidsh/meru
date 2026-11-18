import type { Rectangle, Size } from "./window-bounds.ts";

/** Between two panes, in CSS pixels. */
export const PANE_GAP = 8;

/** The least a pane may be each way, in CSS pixels. */
export const PANE_MINIMUM = 240;

/**
 * The focused pane's ring, drawn by the shell around it; every pane's view is
 * inset by it, so focus moving resizes no page.
 */
export const FOCUS_RING = 1;

/** `row` lays its children side by side, `column` one above another. */
export const PANE_DIRECTIONS = ["row", "column"] as const;

export type PaneDirection = (typeof PANE_DIRECTIONS)[number];

/** A leaf is the id of the tab the pane shows. */
export type PaneTree = string | PaneSplit;

export interface PaneSplit {
  direction: PaneDirection;
  /** Two or more, each with its share of the split's length; shares sum to 1. */
  children: PaneChild[];
}

export interface PaneChild {
  size: number;
  pane: PaneTree;
}

/** The tabs of the panes in reading order: left to right, top to bottom. */
export const paneTabs = (tree: PaneTree): string[] =>
  typeof tree === "string"
    ? [tree]
    : tree.children.flatMap((child) => paneTabs(child.pane));

const total = (children: readonly PaneChild[]) =>
  children.reduce((sum, child) => sum + child.size, 0);

/**
 * The tree in the one shape every reader relies on: shares summing to 1, no
 * split of a single child, and no split inside another of its direction,
 * whose children join their parent's at their share of its share.
 */
const normalize = (tree: PaneTree): PaneTree => {
  if (typeof tree === "string") {
    return tree;
  }

  const children = tree.children.flatMap((child): PaneChild[] => {
    const pane = normalize(child.pane);

    return typeof pane !== "string" && pane.direction === tree.direction
      ? pane.children.map((inner) => ({
          size: inner.size * child.size,
          pane: inner.pane,
        }))
      : [{ size: child.size, pane }];
  });
  const sum = total(children);
  const [only] = children;

  if (children.length === 1 && only) {
    return only.pane;
  }

  return {
    direction: tree.direction,
    children: children.map((child) => ({
      size: sum > 0 ? child.size / sum : 1 / children.length,
      pane: child.pane,
    })),
  };
};

/**
 * Puts `tab` beside the pane of `target` in `direction`, after it, the two
 * sharing what `target` had. Unchanged when `target` has no pane.
 */
export const addPane = (
  tree: PaneTree,
  target: string,
  tab: string,
  direction: PaneDirection
): PaneTree => {
  if (typeof tree === "string") {
    return tree === target
      ? {
          direction,
          children: [
            { size: 0.5, pane: target },
            { size: 0.5, pane: tab },
          ],
        }
      : tree;
  }

  const index = tree.children.findIndex((child) => child.pane === target);
  const found = tree.children[index];

  if (found && tree.direction === direction) {
    const half = { size: found.size / 2 };

    return {
      direction,
      children: tree.children.toSpliced(
        index,
        1,
        { ...half, pane: target },
        { ...half, pane: tab }
      ),
    };
  }

  return normalize({
    direction: tree.direction,
    children: tree.children.map((child) => ({
      size: child.size,
      pane: addPane(child.pane, target, tab, direction),
    })),
  });
};

/**
 * The tree without the pane of `tab`, whose share goes to the panes beside
 * it in proportion; `undefined` when it was the only one.
 */
export const removePane = (
  tree: PaneTree,
  tab: string
): PaneTree | undefined => {
  if (typeof tree === "string") {
    return tree === tab ? undefined : tree;
  }

  const children = tree.children.flatMap((child) => {
    const pane = removePane(child.pane, tab);

    return pane === undefined ? [] : [{ size: child.size, pane }];
  });

  return children.length === 0
    ? undefined
    : normalize({ direction: tree.direction, children });
};

/** Cuts `length` into whole pixels by `shares`, which sum to `length`. */
const cut = (length: number, shares: readonly number[]) => {
  let used = 0;
  let before = 0;

  return shares.map((share) => {
    before += share;

    const end = Math.round(before * length);
    const piece = end - used;

    used = end;

    return piece;
  });
};

export interface PaneRectangle {
  tabId: string;
  bounds: Rectangle;
}

/**
 * Where each pane sits in `area`, in reading order, with `PANE_GAP` between
 * neighbours; the panes and gaps of a split fill its length exactly.
 */
export const paneRectangles = (
  tree: PaneTree,
  area: Rectangle
): PaneRectangle[] => {
  if (typeof tree === "string") {
    return [{ tabId: tree, bounds: area }];
  }

  const row = tree.direction === "row";
  const length = row ? area.width : area.height;
  const gaps = PANE_GAP * (tree.children.length - 1);
  const pieces = cut(
    Math.max(0, length - gaps),
    tree.children.map((child) => child.size)
  );
  let offset = row ? area.x : area.y;

  return tree.children.flatMap((child, index) => {
    const piece = pieces[index] ?? 0;
    const bounds: Rectangle = row
      ? { ...area, x: offset, width: piece }
      : { ...area, y: offset, height: piece };

    offset += piece + PANE_GAP;

    return paneRectangles(child.pane, bounds);
  });
};

/** Whether every pane is at least `PANE_MINIMUM` each way in an area of `size`. */
export const panesFit = (tree: PaneTree, size: Size) =>
  paneRectangles(tree, { x: 0, y: 0, ...size }).every(
    ({ bounds }) =>
      bounds.width >= PANE_MINIMUM && bounds.height >= PANE_MINIMUM
  );

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const MISSING = Symbol("a pane whose tab is gone");

type Read = PaneTree | typeof MISSING;

/**
 * A stored tree read back, or `undefined` when it is not one. A leaf whose
 * tab `isTab` refuses, or that repeats an earlier leaf's, is removed, its
 * share going to its neighbours.
 */
export const readPaneTree = (
  value: unknown,
  isTab: (tabId: string) => boolean
): PaneTree | undefined | "none left" => {
  const seen = new Set<string>();
  let malformed = false;

  const read = (node: unknown): Read => {
    if (typeof node === "string") {
      if (!isTab(node) || seen.has(node)) {
        return MISSING;
      }

      seen.add(node);

      return node;
    }

    if (
      !isRecord(node) ||
      (node.direction !== "row" && node.direction !== "column") ||
      !Array.isArray(node.children)
    ) {
      malformed = true;

      return MISSING;
    }

    const children: PaneChild[] = [];

    for (const child of node.children as unknown[]) {
      if (
        !isRecord(child) ||
        typeof child.size !== "number" ||
        !Number.isFinite(child.size) ||
        child.size < 0
      ) {
        malformed = true;

        return MISSING;
      }

      const pane = read(child.pane);

      if (pane !== MISSING) {
        children.push({ size: child.size, pane });
      }
    }

    return children.length === 0
      ? MISSING
      : normalize({ direction: node.direction, children });
  };

  const tree = read(value);

  if (malformed) {
    return undefined;
  }

  return tree === MISSING ? "none left" : tree;
};

/** A profile's panes, stored on it: the tree and the pane last focused. */
export interface Split {
  root: PaneSplit;
}

/**
 * A profile's stored `split` read back: the split, repaired; `none` when
 * fewer than two of its panes' tabs are left; `as-found` when it is no
 * split at all, which is kept as it was and shows nothing.
 */
export const readSplit = (
  value: unknown,
  isTab: (tabId: string) => boolean
):
  | { kind: "split"; split: Split }
  | { kind: "none" }
  | { kind: "as-found" } => {
  if (!isRecord(value)) {
    return { kind: "as-found" };
  }

  const root = readPaneTree(value.root, isTab);

  if (root === undefined) {
    return { kind: "as-found" };
  }

  if (root === "none left" || typeof root === "string") {
    return { kind: "none" };
  }

  return { kind: "split", split: { ...value, root } };
};
