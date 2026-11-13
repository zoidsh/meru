import { clamp } from "es-toolkit";

import type { Ids } from "../ports.ts";
import type {
  Beside,
  Layout,
  LayoutNode,
  Leaf,
  Orientation,
  Split,
} from "../records/layout.ts";
import type { Point, Rect } from "../records/rect.ts";
import type { Style } from "../records/style.ts";

export interface StyleMetrics {
  readonly inset: number;
  readonly gap: number;
  readonly radius: number;
  /** Whether a 1px line is drawn where panes, titlebar and sidebar meet, rather than leaving the ground and the gaps to set them apart. */
  readonly seams: boolean;
}

export const STYLE_METRICS: Readonly<Record<Style, StyleMetrics>> = {
  classic: { gap: 1, inset: 0, radius: 0, seams: true },
  modern: { gap: 8, inset: 8, radius: 10, seams: false },
};

export const MIN_RATIO = 0.1;
export const MAX_RATIO = 0.9;

export interface Divider {
  readonly splitId: string;
  readonly rect: Rect;
  readonly orientation: Orientation;
}

export interface Arrangement {
  readonly panes: ReadonlyMap<string, Rect>;
  readonly dividers: readonly Divider[];
}

export const leaf = (paneId: string, tabId: string): Leaf => ({
  kind: "leaf",
  paneId,
  tabIds: [tabId],
});

export const panes = (tree: Layout): Leaf[] => {
  if (tree === null) {
    return [];
  }
  if (tree.kind === "leaf") {
    return [tree];
  }
  return [...panes(tree.first), ...panes(tree.second)];
};

/** The id of the pane showing the tab, while the layout shows it. */
export const paneOfTab = (tree: Layout, tabId: string): string | undefined =>
  panes(tree).find((pane) => pane.tabIds.includes(tabId))?.paneId;

/** The tab the pane shows, while the layout has the pane. */
export const tabOfPane = (tree: Layout, paneId: string): string | undefined =>
  panes(tree).find((pane) => pane.paneId === paneId)?.tabIds[0];

const replaceLeaf = (
  node: LayoutNode,
  paneId: string,
  replace: (leaf: Leaf) => LayoutNode | null
): LayoutNode | null => {
  if (node.kind === "leaf") {
    return node.paneId === paneId ? replace(node) : node;
  }
  const first = replaceLeaf(node.first, paneId, replace);
  if (first !== node.first) {
    return first === null ? node.second : { ...node, first };
  }
  const second = replaceLeaf(node.second, paneId, replace);
  if (second !== node.second) {
    return second === null ? node.first : { ...node, second };
  }
  return node;
};

const hasPane = (tree: Layout, paneId: string) =>
  panes(tree).some((pane) => pane.paneId === paneId);

const insertBeside = (
  tree: LayoutNode,
  paneId: string,
  beside: Beside,
  added: Leaf,
  splitId: string
): LayoutNode | null =>
  replaceLeaf(tree, paneId, (target) => ({
    first: beside.side === "before" ? added : target,
    id: splitId,
    kind: "split",
    orientation: beside.orientation,
    ratio: 0.5,
    second: beside.side === "before" ? target : added,
  }));

/** Splits the pane in two, the tab's new pane on the side `beside` names. */
export const split = (
  tree: Layout,
  paneId: string,
  beside: Beside,
  tabId: string,
  ids: Ids
): { readonly layout: LayoutNode; readonly paneId: string } | undefined => {
  if (tree === null || !hasPane(tree, paneId)) {
    return undefined;
  }
  const splitId = ids();
  const added = leaf(ids(), tabId);
  const layout = insertBeside(tree, paneId, beside, added, splitId);
  return layout === null ? undefined : { layout, paneId: added.paneId };
};

export const close = (tree: Layout, paneId: string): Layout =>
  tree === null ? null : replaceLeaf(tree, paneId, () => null);

const parentOf = (node: LayoutNode, paneId: string): Split | undefined => {
  if (node.kind === "leaf") {
    return undefined;
  }
  const holds = (child: LayoutNode) =>
    child.kind === "leaf" && child.paneId === paneId;
  if (holds(node.first) || holds(node.second)) {
    return node;
  }
  return parentOf(node.first, paneId) ?? parentOf(node.second, paneId);
};

// The split the pane leaves closes with it, so the split it makes beside the target takes that id and the move needs no new one.
/** Takes the pane out of its place and puts it beside the target pane, keeping its id and tabs; undefined for a pane that is missing, alone or the target itself. */
export const movePane = (
  tree: Layout,
  paneId: string,
  targetPaneId: string,
  beside: Beside
): LayoutNode | undefined => {
  const moving = panes(tree).find((pane) => pane.paneId === paneId);
  const parent = tree === null ? undefined : parentOf(tree, paneId);
  const without = close(tree, paneId);
  if (
    moving === undefined ||
    parent === undefined ||
    without === null ||
    !hasPane(without, targetPaneId)
  ) {
    return undefined;
  }
  return (
    insertBeside(without, targetPaneId, beside, moving, parent.id) ?? undefined
  );
};

const mapLeaves = (
  node: LayoutNode,
  update: (leaf: Leaf) => Leaf
): LayoutNode =>
  node.kind === "leaf"
    ? update(node)
    : {
        ...node,
        first: mapLeaves(node.first, update),
        second: mapLeaves(node.second, update),
      };

/** Puts each of the two panes where the other was; undefined unless both are there and differ. */
export const swap = (
  tree: Layout,
  a: string,
  b: string
): LayoutNode | undefined => {
  const found = panes(tree);
  const first = found.find((pane) => pane.paneId === a);
  const second = found.find((pane) => pane.paneId === b);
  if (tree === null || first === undefined || second === undefined || a === b) {
    return undefined;
  }
  return mapLeaves(tree, (node) => {
    if (node.paneId === a) {
      return second;
    }
    return node.paneId === b ? first : node;
  });
};

/** How many panes share the node's length along `orientation`. */
const weight = (node: LayoutNode, orientation: Orientation): number =>
  node.kind === "split" && node.orientation === orientation
    ? weight(node.first, orientation) + weight(node.second, orientation)
    : 1;

const balanceNode = (node: LayoutNode): LayoutNode => {
  if (node.kind === "leaf") {
    return node;
  }
  const first = weight(node.first, node.orientation);
  const second = weight(node.second, node.orientation);
  return {
    ...node,
    first: balanceNode(node.first),
    ratio: clamp(first / (first + second), MIN_RATIO, MAX_RATIO),
    second: balanceNode(node.second),
  };
};

/** Gives every pane in a run of splits of one orientation the same share of it. */
export const balance = (tree: Layout): Layout =>
  tree === null ? null : balanceNode(tree);

const mapSplit = (
  node: LayoutNode,
  splitId: string,
  update: (split: Split) => Split
): LayoutNode => {
  if (node.kind === "leaf") {
    return node;
  }
  if (node.id === splitId) {
    return update(node);
  }
  const first = mapSplit(node.first, splitId, update);
  if (first !== node.first) {
    return { ...node, first };
  }
  const second = mapSplit(node.second, splitId, update);
  return second === node.second ? node : { ...node, second };
};

export const resize = (tree: Layout, splitId: string, ratio: number): Layout =>
  tree === null
    ? null
    : mapSplit(tree, splitId, (node) => ({
        ...node,
        ratio: clamp(ratio, MIN_RATIO, MAX_RATIO),
      }));

export const focusNext = (tree: Layout, paneId: string): string | undefined => {
  const ids = panes(tree).map((pane) => pane.paneId);
  const index = ids.indexOf(paneId);
  return ids[(index + 1) % ids.length];
};

export const focusPrevious = (
  tree: Layout,
  paneId: string
): string | undefined => {
  const ids = panes(tree).map((pane) => pane.paneId);
  const index = ids.indexOf(paneId);
  return ids.at(index <= 0 ? -1 : index - 1);
};

/** What a stage shows of its group's layout beyond the layout itself, the panes named by tab, since a pane's id changes under a join or a move. */
export interface Showing {
  /** The layout as a divider drag has moved it, while one is on. */
  readonly drag: Layout | undefined;
  /** The tab whose pane takes the whole stage, the others hidden. */
  readonly maximised: string | undefined;
  /** The tab whose page is fullscreen, whose pane takes the whole window. */
  readonly fullscreen: string | undefined;
}

/** The layout a stage shows: the drag's while one is on, and of it only the fullscreen tab's pane, else only the maximised tab's, while it holds them. */
export const shownLayout = (tree: Layout, showing: Showing): Layout => {
  const base = showing.drag ?? tree;
  for (const tabId of [showing.fullscreen, showing.maximised]) {
    const pane =
      tabId === undefined
        ? undefined
        : panes(base).find((found) => found.tabIds.includes(tabId));
    if (pane !== undefined) {
      return pane;
    }
  }
  return base;
};

/** The sides of the area that keep no inset. */
export interface Flush {
  readonly top: boolean;
  readonly left: boolean;
}

export const NO_FLUSH: Flush = { left: false, top: false };

const inset = (rect: Rect, by: number, flush: Flush): Rect => {
  const left = flush.left ? 0 : Math.min(by, rect.width);
  const right = Math.min(by, rect.width - left);
  const top = flush.top ? 0 : Math.min(by, rect.height);
  const bottom = Math.min(by, rect.height - top);
  return {
    height: rect.height - top - bottom,
    width: rect.width - left - right,
    x: rect.x + left,
    y: rect.y + top,
  };
};

interface Division {
  readonly first: Rect;
  readonly divider: Rect;
  readonly second: Rect;
  readonly start: number;
  readonly available: number;
  readonly gap: number;
}

// Rounding only the first side and giving the second the remainder keeps every edge on a whole pixel while the sides and the gap still add up to the split's length, so nested splits can never open a gap or overlap.
const divide = (
  rect: Rect,
  orientation: Orientation,
  ratio: number,
  gapWanted: number
): Division => {
  const vertical = orientation === "vertical";
  const length = vertical ? rect.width : rect.height;
  const gap = Math.min(gapWanted, length);
  const available = length - gap;
  const size = clamp(Math.round(available * ratio), 0, available);
  if (vertical) {
    return {
      available,
      divider: { ...rect, width: gap, x: rect.x + size },
      first: { ...rect, width: size },
      gap,
      second: { ...rect, width: available - size, x: rect.x + size + gap },
      start: rect.x,
    };
  }
  return {
    available,
    divider: { ...rect, height: gap, y: rect.y + size },
    first: { ...rect, height: size },
    gap,
    second: { ...rect, height: available - size, y: rect.y + size + gap },
    start: rect.y,
  };
};

const visit = (
  node: LayoutNode,
  rect: Rect,
  gap: number,
  onSplit: (split: Split, division: Division) => void,
  onLeaf?: (leaf: Leaf, rect: Rect) => void
): void => {
  if (node.kind === "leaf") {
    onLeaf?.(node, rect);
    return;
  }
  const division = divide(rect, node.orientation, node.ratio, gap);
  onSplit(node, division);
  visit(node.first, division.first, gap, onSplit, onLeaf);
  visit(node.second, division.second, gap, onSplit, onLeaf);
};

export const layout = (
  tree: Layout,
  rect: Rect,
  style: Style,
  flush: Flush = NO_FLUSH,
  fullscreenPaneId?: string
): Arrangement => {
  if (tree === null) {
    return { dividers: [], panes: new Map() };
  }
  if (
    fullscreenPaneId !== undefined &&
    panes(tree).some((pane) => pane.paneId === fullscreenPaneId)
  ) {
    return { dividers: [], panes: new Map([[fullscreenPaneId, rect]]) };
  }
  const metrics = STYLE_METRICS[style];
  const rects = new Map<string, Rect>();
  const dividers: Divider[] = [];
  visit(
    tree,
    inset(rect, metrics.inset, flush),
    metrics.gap,
    (node, division) => {
      dividers.push({
        orientation: node.orientation,
        rect: division.divider,
        splitId: node.id,
      });
    },
    (node, at) => {
      rects.set(node.paneId, at);
    }
  );
  return { dividers, panes: rects };
};

export const ratioAt = (
  tree: Layout,
  rect: Rect,
  style: Style,
  splitId: string,
  point: Point,
  flush: Flush = NO_FLUSH
): number | undefined => {
  if (tree === null) {
    return undefined;
  }
  const metrics = STYLE_METRICS[style];
  let ratio: number | undefined;
  visit(
    tree,
    inset(rect, metrics.inset, flush),
    metrics.gap,
    (node, division) => {
      if (node.id !== splitId || division.available === 0) {
        return;
      }
      const along = node.orientation === "vertical" ? point.x : point.y;
      const offset = along - division.start - division.gap / 2;
      ratio = clamp(offset / division.available, MIN_RATIO, MAX_RATIO);
    }
  );
  return ratio;
};
