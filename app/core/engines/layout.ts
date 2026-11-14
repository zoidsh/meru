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
import { stepFrom } from "../values.ts";

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

/** The tab whose pane takes focus once the tab `gone` has left the layout `before`, leaving `after`: the one now in its place in layout order, else the last; the first when `before` did not hold `gone`. */
export const tabAfterLeaving = (
  before: Layout,
  after: Layout,
  gone: string | undefined
): string | undefined => {
  const index = panes(before).findIndex(
    (pane) => gone !== undefined && pane.tabIds.includes(gone)
  );
  const left = panes(after);
  return left[Math.min(Math.max(index, 0), left.length - 1)]?.tabIds[0];
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

const equaliseNode = (node: LayoutNode): LayoutNode => {
  if (node.kind === "leaf") {
    return node;
  }
  const first = weight(node.first, node.orientation);
  const second = weight(node.second, node.orientation);
  return {
    ...node,
    first: equaliseNode(node.first),
    ratio: clamp(first / (first + second), MIN_RATIO, MAX_RATIO),
    second: equaliseNode(node.second),
  };
};

/** Gives every pane in a run of splits of one orientation the same share of it. */
export const equalise = (tree: Layout): Layout =>
  tree === null ? null : equaliseNode(tree);

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

const paneIds = (tree: Layout): string[] =>
  panes(tree).map((pane) => pane.paneId);

export const focusNext = (tree: Layout, paneId: string): string | undefined =>
  stepFrom(paneIds(tree), paneId, 1);

export const focusPrevious = (
  tree: Layout,
  paneId: string
): string | undefined => stepFrom(paneIds(tree), paneId, -1);

/** Where over a pane a dragged tab lands: beside one of its edges, taking that half, or in the middle, joining beside it. */
export type DropZone = "left" | "right" | "top" | "bottom" | "centre";

/** The share of a pane's width or height, from each edge, that drops beside that edge. */
export const EDGE_ZONE = 0.2;

/** The zone of the pane's rect under the point: the nearest edge while within its fifth, else the middle; undefined outside the rect. */
export const dropZoneAt = (rect: Rect, point: Point): DropZone | undefined => {
  if (rect.width === 0 || rect.height === 0) {
    return undefined;
  }
  const across = (point.x - rect.x) / rect.width;
  const down = (point.y - rect.y) / rect.height;
  if (across < 0 || across >= 1 || down < 0 || down >= 1) {
    return undefined;
  }
  const edges: readonly (readonly [DropZone, number])[] = [
    ["left", across],
    ["right", 1 - across],
    ["top", down],
    ["bottom", 1 - down],
  ];
  let nearest: DropZone = "centre";
  let distance = EDGE_ZONE;
  for (const [zone, from] of edges) {
    if (from < distance) {
      nearest = zone;
      distance = from;
    }
  }
  return nearest;
};

const BESIDE: Readonly<Record<DropZone, Beside>> = {
  bottom: { orientation: "horizontal", side: "after" },
  centre: { orientation: "vertical", side: "after" },
  left: { orientation: "vertical", side: "before" },
  right: { orientation: "vertical", side: "after" },
  top: { orientation: "horizontal", side: "before" },
};

/** Where a tab dropped on the zone goes against the pane. */
export const placementOf = (zone: DropZone): Beside => BESIDE[zone];

/** The part of the pane a tab dropped on the zone takes, which the drop marks: the half by an edge, the whole pane in the middle. */
export const dropRect = (rect: Rect, zone: DropZone): Rect => {
  const width = Math.round(rect.width / 2);
  const height = Math.round(rect.height / 2);
  const rects: Readonly<Record<DropZone, Rect>> = {
    bottom: { ...rect, height: rect.height - height, y: rect.y + height },
    centre: rect,
    left: { ...rect, width },
    right: { ...rect, width: rect.width - width, x: rect.x + width },
    top: { ...rect, height },
  };
  return rects[zone];
};

/** Where a tab let go at a point lands among the panes. */
export interface DropTarget {
  /** The tab of the pane under the point. */
  readonly tabId: string;
  readonly zone: DropZone;
  /** The part of that pane the dropped tab takes. */
  readonly rect: Rect;
}

// A pinned tab stays first in its group's layout as in the sidebar's rows, so nothing lands before it.
const AFTER_PINNED: Readonly<Record<DropZone, DropZone>> = {
  bottom: "bottom",
  centre: "centre",
  left: "right",
  right: "right",
  top: "bottom",
};

/** The pane under the point and where on it the tab `tabId` would land, a pinned pane's left and top fifths landing on its right and bottom; nothing over the tab's own pane or off every pane. */
export const dropTargetAt = (
  shown: readonly {
    readonly rect: Rect;
    readonly tabId: string;
    readonly pinned?: boolean;
  }[],
  point: Point,
  tabId: string
): DropTarget | undefined => {
  for (const pane of shown) {
    const found = dropZoneAt(pane.rect, point);
    const zone =
      found === undefined || pane.pinned !== true ? found : AFTER_PINNED[found];
    if (zone !== undefined) {
      return pane.tabId === tabId
        ? undefined
        : { rect: dropRect(pane.rect, zone), tabId: pane.tabId, zone };
    }
  }
  return undefined;
};

/** The sides of the area that keep no inset. */
export interface Flush {
  readonly top: boolean;
  readonly left: boolean;
}

const NO_FLUSH: Flush = { left: false, top: false };

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
  flush: Flush = NO_FLUSH
): Arrangement => {
  if (tree === null) {
    return { dividers: [], panes: new Map() };
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
