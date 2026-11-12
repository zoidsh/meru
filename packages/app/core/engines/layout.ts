import type { Ids } from "../ports.ts";
import type {
  Layout,
  LayoutNode,
  Leaf,
  Orientation,
  Split,
} from "../records/layout.ts";
import type { Rect } from "../records/rect.ts";
import type { Style } from "../records/style.ts";
import { clamp } from "./ordering.ts";

export interface StyleMetrics {
  /** Space between the content area's edge and the panes. */
  readonly inset: number;
  /** Space between two panes, which the divider fills. */
  readonly gap: number;
  readonly radius: number;
}

export const STYLE_METRICS: Readonly<Record<Style, StyleMetrics>> = {
  classic: { gap: 1, inset: 0, radius: 0 },
  modern: { gap: 8, inset: 8, radius: 10 },
};

export const MIN_RATIO = 0.1;
export const MAX_RATIO = 0.9;

export interface Point {
  readonly x: number;
  readonly y: number;
}

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

/** Every leaf, first side before second, which is the order panes are stacked and focus moves in. */
export const panes = (tree: Layout): Leaf[] => {
  if (tree === null) {
    return [];
  }
  if (tree.kind === "leaf") {
    return [tree];
  }
  return [...panes(tree.first), ...panes(tree.second)];
};

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

/** The layout with the pane halved and a new pane showing `tabId` in its second half, or `undefined` when the pane is not in it. */
export const split = (
  tree: Layout,
  paneId: string,
  orientation: Orientation,
  tabId: string,
  ids: Ids
): { readonly layout: LayoutNode; readonly paneId: string } | undefined => {
  if (tree === null || !panes(tree).some((pane) => pane.paneId === paneId)) {
    return undefined;
  }
  const splitId = ids();
  const added = leaf(ids(), tabId);
  const layout = replaceLeaf(tree, paneId, (first) => ({
    first,
    id: splitId,
    kind: "split",
    orientation,
    ratio: 0.5,
    second: added,
  }));
  return layout === null ? undefined : { layout, paneId: added.paneId };
};

/** The layout without the pane, its sibling taking the split's place; the same tree when the pane is not in it. */
export const close = (tree: Layout, paneId: string): Layout =>
  tree === null ? null : replaceLeaf(tree, paneId, () => null);

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

/** The pane after this one in layout order, wrapping; the first pane when this one is not in the layout. */
export const focusNext = (tree: Layout, paneId: string): string | undefined => {
  const ids = panes(tree).map((pane) => pane.paneId);
  const index = ids.indexOf(paneId);
  return ids[(index + 1) % ids.length];
};

const inset = (rect: Rect, by: number): Rect => {
  const x = Math.min(by, Math.floor(rect.width / 2));
  const y = Math.min(by, Math.floor(rect.height / 2));
  return {
    height: rect.height - 2 * y,
    width: rect.width - 2 * x,
    x: rect.x + x,
    y: rect.y + y,
  };
};

interface Division {
  readonly first: Rect;
  readonly divider: Rect;
  readonly second: Rect;
  /** Where along the axis the split starts, and the length its two sides share. */
  readonly start: number;
  readonly available: number;
  readonly gap: number;
}

// The rounding rule: the first side takes the rounded share of the length left after the gap and the second side the remainder, so every edge lands on an integer and the sides and gap always add up to the split's length.
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
  onLeaf: (leaf: Leaf, rect: Rect) => void,
  onSplit: (split: Split, division: Division) => void
): void => {
  if (node.kind === "leaf") {
    onLeaf(node, rect);
    return;
  }
  const division = divide(rect, node.orientation, node.ratio, gap);
  onSplit(node, division);
  visit(node.first, division.first, gap, onLeaf, onSplit);
  visit(node.second, division.second, gap, onLeaf, onSplit);
};

/**
 * Where each pane and divider goes in the content `rect`. A pane in fullscreen takes the whole rect, inset dropped, and every other pane is left out.
 */
export const layout = (
  tree: Layout,
  rect: Rect,
  style: Style,
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
    inset(rect, metrics.inset),
    metrics.gap,
    (node, at) => {
      rects.set(node.paneId, at);
    },
    (node, division) => {
      dividers.push({
        orientation: node.orientation,
        rect: division.divider,
        splitId: node.id,
      });
    }
  );
  return { dividers, panes: rects };
};

/** The ratio that puts the split's divider centred on `point`, clamped, or `undefined` when the split is not in the layout or has no length to share. */
export const ratioAt = (
  tree: Layout,
  rect: Rect,
  style: Style,
  splitId: string,
  point: Point
): number | undefined => {
  if (tree === null) {
    return undefined;
  }
  const metrics = STYLE_METRICS[style];
  let ratio: number | undefined;
  visit(
    tree,
    inset(rect, metrics.inset),
    metrics.gap,
    () => {
      // Leaves carry no ratio.
    },
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
