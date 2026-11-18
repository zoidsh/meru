import { clamp } from "es-toolkit";

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

/** Where each child of `split` sits in `area`, with `PANE_GAP` between them. */
const childAreas = (split: PaneSplit, area: Rectangle): Rectangle[] => {
  const row = split.direction === "row";
  const length = row ? area.width : area.height;
  const gaps = PANE_GAP * (split.children.length - 1);
  const pieces = cut(
    Math.max(0, length - gaps),
    split.children.map((child) => child.size)
  );
  let offset = row ? area.x : area.y;

  return pieces.map((piece) => {
    const bounds: Rectangle = row
      ? { ...area, x: offset, width: piece }
      : { ...area, y: offset, height: piece };

    offset += piece + PANE_GAP;

    return bounds;
  });
};

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

  const areas = childAreas(tree, area);

  return tree.children.flatMap((child, index) =>
    paneRectangles(child.pane, areas[index] ?? area)
  );
};

/**
 * The least length `tree` takes along `direction`, its gaps included, with
 * its shares as they are: a split along it shares out what it gets in
 * proportion, so it needs enough for the child that needs most for its
 * share, and as `cut` rounds its pieces, a pixel or two more at times.
 */
const minimumLength = (tree: PaneTree, direction: PaneDirection): number => {
  if (typeof tree === "string") {
    return PANE_MINIMUM;
  }

  const lengths = tree.children.map((child) =>
    minimumLength(child.pane, direction)
  );

  if (tree.direction !== direction) {
    return Math.max(...lengths);
  }

  const shares = tree.children.map((child) => child.size);

  // A child with no share gets nothing at any length.
  if (shares.some((share) => share <= 0)) {
    return Number.POSITIVE_INFINITY;
  }

  const fits = (length: number) =>
    cut(length, shares).every((piece, index) => piece >= (lengths[index] ?? 0));
  let length = Math.ceil(
    Math.max(...lengths.map((least, index) => least / (shares[index] ?? 1)))
  );

  while (Number.isFinite(length) && !fits(length)) {
    length += 1;
  }

  return length + PANE_GAP * (tree.children.length - 1);
};

/** The gap between two neighbouring children of a split, which resizes them. */
export interface PaneHandle {
  /**
   * The first tab, in reading order, of the child before the gap and of the
   * one after it, which together name the gap.
   */
  before: string;
  after: string;
  /** The split's: a `row` split's gap moves across, a `column` one's down. */
  direction: PaneDirection;
  /** The gap itself. */
  bounds: Rectangle;
  /** The length of the child before the gap along the split. */
  size: number;
  /** The two children's lengths together, which a move shares out anew. */
  span: number;
  /**
   * The least and most that length may become: neither child below its
   * minimum, unless it is already, when it is not made any smaller.
   */
  minimum: number;
  maximum: number;
}

const firstTab = (tree: PaneTree): string =>
  typeof tree === "string" ? tree : firstTab(tree.children[0]?.pane ?? "");

/** Every gap of the tree laid out in `area`, outer splits' first. */
export const paneHandles = (tree: PaneTree, area: Rectangle): PaneHandle[] => {
  if (typeof tree === "string") {
    return [];
  }

  const row = tree.direction === "row";
  const areas = childAreas(tree, area);
  const length = (bounds: Rectangle) => (row ? bounds.width : bounds.height);
  const own = tree.children.slice(1).flatMap((next, index): PaneHandle[] => {
    const child = tree.children[index];
    const first = areas[index];
    const second = areas[index + 1];

    if (!child || !first || !second) {
      return [];
    }

    const size = length(first);
    const span = size + length(second);
    const leastAfter = minimumLength(next.pane, tree.direction);

    return [
      {
        before: firstTab(child.pane),
        after: firstTab(next.pane),
        direction: tree.direction,
        bounds: row
          ? { ...first, x: first.x + first.width, width: PANE_GAP }
          : { ...first, y: first.y + first.height, height: PANE_GAP },
        size,
        span,
        minimum: Math.min(size, minimumLength(child.pane, tree.direction)),
        maximum: span - Math.min(length(second), leastAfter),
      },
    ];
  });

  return [
    ...own,
    ...tree.children.flatMap((child, index) =>
      paneHandles(child.pane, areas[index] ?? area)
    ),
  ];
};

const holds = (tree: PaneTree, tab: string): boolean =>
  typeof tree === "string"
    ? tree === tab
    : tree.children.some((child) => holds(child.pane, tab));

/**
 * The tree with the split where `before` and `after` part, the one that holds
 * them in two of its children, changed by `change`, given those children's
 * places; unchanged when they never part, or `after` comes first.
 */
const atParting = (
  tree: PaneTree,
  before: string,
  after: string,
  change: (split: PaneSplit, first: number, second: number) => PaneSplit
): PaneTree => {
  if (typeof tree === "string") {
    return tree;
  }

  const first = tree.children.findIndex((child) => holds(child.pane, before));
  const second = tree.children.findIndex((child) => holds(child.pane, after));

  if (first === -1 || second === -1 || second < first) {
    return tree;
  }

  if (first < second) {
    return change(tree, first, second);
  }

  return {
    ...tree,
    children: tree.children.map((child, index) =>
      index === first
        ? { ...child, pane: atParting(child.pane, before, after, change) }
        : child
    ),
  };
};

/**
 * The share of the two children where `before` and `after` part that goes
 * to `before`'s; `undefined` when they never part.
 */
export const partingShare = (
  tree: PaneTree,
  before: string,
  after: string
): number | undefined => {
  let share: number | undefined;

  atParting(tree, before, after, (split, first, second) => {
    const a = split.children[first]?.size ?? 0;
    const b = split.children[second]?.size ?? 0;

    share = a + b > 0 ? a / (a + b) : 0.5;

    return split;
  });

  return share;
};

/**
 * The tree with the two children where `before` and `after` part sharing
 * what they had, `share` of it to `before`'s; every other share, the
 * children's own splits' included, stays.
 */
export const withPartingShare = (
  tree: PaneTree,
  before: string,
  after: string,
  share: number
): PaneTree =>
  atParting(tree, before, after, (split, first, second) => {
    const a = split.children[first]?.size ?? 0;
    const b = split.children[second]?.size ?? 0;
    const sizes = new Map([
      [first, (a + b) * share],
      [second, (a + b) * (1 - share)],
    ]);

    return {
      ...split,
      children: split.children.map((child, index) => ({
        ...child,
        size: sizes.get(index) ?? child.size,
      })),
    };
  });

/**
 * The tree laid out in `size` with the gap between `before` and `after`
 * moved `by` pixels along its split, as far as its handle's minimum and
 * maximum let it; unchanged where there is no such gap.
 */
export const resizePanes = (
  tree: PaneTree,
  size: Size,
  before: string,
  after: string,
  by: number
): PaneTree => {
  const handle = paneHandles(tree, { x: 0, y: 0, ...size }).find(
    (candidate) => candidate.before === before && candidate.after === after
  );

  if (!handle || handle.span <= 0) {
    return tree;
  }

  const next = clamp(handle.size + by, handle.minimum, handle.maximum);

  return withPartingShare(tree, before, after, next / handle.span);
};

/** The tree with the split where `before` and `after` part evened out. */
export const evenOut = (tree: PaneTree, before: string, after: string) =>
  atParting(tree, before, after, (split) => ({
    ...split,
    children: split.children.map((child) => ({
      ...child,
      size: 1 / split.children.length,
    })),
  }));

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

/** A profile's panes, stored on it. */
export interface Split {
  root: PaneSplit;
  /**
   * `true` while the focused pane shows alone, the split kept; anything else
   * reads as not and is kept as found.
   */
  maximized?: unknown;
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
