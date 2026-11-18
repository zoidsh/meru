/** A rectangle by its edges, in CSS pixels of one document. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A tab of the area a drag is in, where it is drawn, in the area's order. */
export interface DropTile {
  id: string;
  box: Box;
}

/** Where a dragged tab would land, and the line that shows it. */
export interface Drop {
  /** The tab it would land before; none for the area's end. */
  before: string | undefined;
  line: Box;
}

const LINE = 2;

/** Between two items whose gap is not there to measure, as the list's. */
const GAP = 8;

/**
 * The share of a tile at either end of it that means beside it; the middle
 * is for dropping onto it, which splits panes.
 */
const EDGE = 0.25;

const union = (tiles: readonly DropTile[]): Box => ({
  left: Math.min(...tiles.map(({ box }) => box.left)),
  top: Math.min(...tiles.map(({ box }) => box.top)),
  right: Math.max(...tiles.map(({ box }) => box.right)),
  bottom: Math.max(...tiles.map(({ box }) => box.bottom)),
});

/** The tiles in rows, those side by side sharing one. */
const rowsOf = (tiles: readonly DropTile[]) => {
  const rows: DropTile[][] = [];

  for (const tile of tiles) {
    const row = rows.at(-1);
    const first = row?.[0];

    if (row && first && Math.abs(first.box.top - tile.box.top) < 1) {
      row.push(tile);
    } else {
      rows.push([tile]);
    }
  }

  return rows;
};

/**
 * Where a tab dragged within its area would land with the pointer at
 * `point`, and the line that shows it: across between two rows, or in a row
 * of tiles side by side, down between two of them. Nothing over the middle
 * of a tile, nor where the tab would land in its own place; a tab from
 * outside the tiles, as one leaving a split's box, has no own place.
 */
export const tabDrop = (
  tiles: readonly DropTile[],
  dragged: string,
  point: { x: number; y: number }
): Drop | undefined => {
  const own = tiles.findIndex((tile) => tile.id === dragged);
  const rows = rowsOf(tiles).map((row) => ({ row, box: union(row) }));
  const indexOf = (tile: DropTile) => tiles.indexOf(tile);

  const drop = (index: number, line: Box): Drop | undefined =>
    own !== -1 && (index === own || index === own + 1)
      ? undefined
      : { before: tiles[index]?.id, line };

  /** Across, above row `at`, or below the last when `at` is past it. */
  const across = (at: number) => {
    const next = rows[at];
    const previous = rows[at - 1];
    const reference = next ?? previous;

    if (!reference) {
      return;
    }

    const measured =
      next && previous
        ? next.box.top - previous.box.bottom
        : ((rows[1] && rows[0] && rows[1].box.top - rows[0].box.bottom) ?? GAP);
    const y = next
      ? next.box.top - measured / 2 - LINE / 2
      : reference.box.bottom + measured / 2 - LINE / 2;

    return drop(next?.row[0] ? indexOf(next.row[0]) : tiles.length, {
      left: reference.box.left - 3,
      top: y,
      right: reference.box.right + 3,
      bottom: y + LINE,
    });
  };

  /** Down, beside the tile on the side given. */
  const beside = (row: readonly DropTile[], tile: DropTile, after: boolean) => {
    const [first, second] = row;
    const gap = first && second ? second.box.left - first.box.right : GAP;
    const x = after
      ? tile.box.right + gap / 2 - LINE / 2
      : tile.box.left - gap / 2 - LINE / 2;

    return drop(indexOf(tile) + (after ? 1 : 0), {
      left: x,
      top: tile.box.top,
      right: x + LINE,
      bottom: tile.box.bottom,
    });
  };

  const at = rows.findIndex(
    ({ box }) => point.y >= box.top && point.y <= box.bottom
  );
  const found = rows[at];

  if (!found) {
    return across(
      rows.filter(({ box }) => (box.top + box.bottom) / 2 < point.y).length
    );
  }

  const { row } = found;
  const [first] = row;
  const last = row.at(-1);

  if (!first || !last) {
    return;
  }

  if (row.length === 1) {
    const share =
      (point.y - first.box.top) / (first.box.bottom - first.box.top);

    if (share <= EDGE) {
      return across(at);
    }

    return share >= 1 - EDGE ? across(at + 1) : undefined;
  }

  const over = row.find(
    ({ box }) => point.x >= box.left && point.x <= box.right
  );

  if (!over) {
    if (point.x < first.box.left) {
      return beside(row, first, false);
    }

    if (point.x > last.box.right) {
      return beside(row, last, true);
    }

    const right = row.find(({ box }) => box.left > point.x) ?? last;

    return beside(row, right, false);
  }

  const share = (point.x - over.box.left) / (over.box.right - over.box.left);

  if (share <= EDGE) {
    return beside(row, over, false);
  }

  return share >= 1 - EDGE ? beside(row, over, true) : undefined;
};

/** A tab's button anywhere in the sidebar, which a tab can be dropped onto. */
export interface DropTarget extends DropTile {
  /** Which of `boxes` it is in, by place; none outside every box. */
  inBox: number | undefined;
}

/** A split's box as drawn, with its tabs that are not pinned, in its order. */
export interface DropBox {
  box: Box;
  rows: readonly DropTile[];
}

/** What a drop in the sidebar does, and what shows it. */
export type SidebarDrop =
  /** Onto a tab, which rings: the two split, the dragged tab on the right. */
  | { kind: "onto"; target: string; ring: Box }
  /** Within its box, an inset line: the tab and its pane move among its tabs. */
  | { kind: "box"; before: string | undefined; line: Box }
  /** A line in the area: the tab moves there, out of its split if in one. */
  | { kind: "move"; before: string | undefined; line: Box };

export interface SidebarDropInput {
  dragged: { id: string; pinned: boolean; inBox: number | undefined };
  point: { x: number; y: number };
  /** Every tab's button. */
  tabs: readonly DropTarget[];
  /** Every split's box as drawn. */
  boxes: readonly DropBox[];
  /**
   * The places of the area the dragged tab moves in, the pinned tiles or the
   * list, while the pointer is over it; none elsewhere. A box first in the
   * pinned area is none of its places.
   */
  area?: readonly DropTile[] | undefined;
  /**
   * With no list drawn, as when every tab not pinned is in a box among the
   * pinned tiles: the sidebar below the pinned area, which is the list's
   * end to a tab not pinned, and the button after the list, which the
   * line there goes above.
   */
  noList?: { below: Box; next: Box } | undefined;
}

/** How far inside the box's top and bottom edge the pointer still counts as outside it. */
const BOX_BAND = 6;

/** How far a line in the box is drawn in from each side of its rows. */
const BOX_INSET = 6;

/** Whether the point is within the box, its edges included. */
export const inside = (box: Box, { x, y }: { x: number; y: number }) =>
  x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;

/** How far across `tab` the point is, along its row where it has a neighbour there, else down. */
const shareAcross = (
  tab: DropTarget,
  tabs: readonly DropTarget[],
  { x, y }: { x: number; y: number }
) => {
  const sideways = tabs.some(
    (other) => other !== tab && Math.abs(other.box.top - tab.box.top) < 1
  );

  return sideways
    ? (x - tab.box.left) / (tab.box.right - tab.box.left)
    : (y - tab.box.top) / (tab.box.bottom - tab.box.top);
};

/** The inset line between the box's rows nearest the point. */
const boxLine = (
  rows: readonly DropTile[],
  dragged: string,
  { y }: { x: number; y: number }
): SidebarDrop | undefined => {
  const own = rows.findIndex((row) => row.id === dragged);
  const index = rows.filter(({ box }) => (box.top + box.bottom) / 2 < y).length;
  const next = rows[index];
  const previous = rows[index - 1];
  const reference = next ?? previous;

  if (!reference || index === own || index === own + 1) {
    return undefined;
  }

  const gap =
    next && previous
      ? next.box.top - previous.box.bottom
      : ((rows[1] && rows[0] && rows[1].box.top - rows[0].box.bottom) ?? GAP);
  const top = next
    ? next.box.top - gap / 2 - LINE / 2
    : reference.box.bottom + gap / 2 - LINE / 2;

  return {
    kind: "box",
    before: next?.id,
    line: {
      left: reference.box.left + BOX_INSET,
      top,
      right: reference.box.right - BOX_INSET,
      bottom: top + LINE,
    },
  };
};

/** A move to the area's end, by a line at `y` across `span` and 3px past it. */
const endLine = (span: Box, y: number): SidebarDrop => ({
  kind: "move",
  before: undefined,
  line: {
    left: span.left - 3,
    top: y - LINE / 2,
    right: span.right + 3,
    bottom: y + LINE / 2,
  },
});

const onto = (target: DropTarget): SidebarDrop => ({
  kind: "onto",
  target: target.id,
  ring: target.box,
});

/** A line in the dragged tab's area, or at its end where it has no places. */
const areaMove = ({
  dragged,
  point,
  boxes,
  area,
  noList,
}: Omit<SidebarDropInput, "tabs">): SidebarDrop | undefined => {
  const own = dragged.inBox === undefined ? undefined : boxes[dragged.inBox];
  // A tab of a box has no place of its own among the area's: the box
  // stands for its first stored tab, which may be this one.
  const line = area && tabDrop(area, own ? "" : dragged.id, point);

  if (line) {
    return { kind: "move", before: line.before, line: line.line };
  }

  // A pinned tab of a box, where boxes are all the pinned area holds,
  // lands after its box.
  if (own && area?.length === 0) {
    return endLine(own.box, own.box.bottom + GAP / 2);
  }

  if (!dragged.pinned && noList && inside(noList.below, point)) {
    return endLine(noList.next, (noList.below.top + noList.next.top) / 2);
  }

  return undefined;
};

/**
 * What dropping a dragged tab with the pointer at `point` in the sidebar
 * does. Over the middle of another tab it rings that tab, which a drop
 * splits with the dragged one, joining the target's split or starting one.
 * Inside its own box, a tab that is not pinned moves among the box's others
 * by an inset line, a pinned one not at all; inside another box, a tab only
 * rings a tab of that box. Elsewhere in its area, a line between places,
 * between two boxes included, moves it there, out of its split if in one.
 */
export const sidebarDrop = ({
  dragged,
  point,
  tabs,
  boxes,
  area,
  noList,
}: SidebarDropInput): SidebarDrop | undefined => {
  const over = tabs.find(
    (tab) => tab.id !== dragged.id && inside(tab.box, point)
  );
  const under = boxes.findIndex(({ box }) =>
    inside(
      { ...box, top: box.top + BOX_BAND, bottom: box.bottom - BOX_BAND },
      point
    )
  );
  const inBox = boxes[under];

  if (inBox) {
    if (dragged.inBox !== under) {
      return over?.inBox === under ? onto(over) : undefined;
    }

    return dragged.pinned ? undefined : boxLine(inBox.rows, dragged.id, point);
  }

  if (over && over.inBox === undefined) {
    const share = shareAcross(over, tabs, point);

    if (share > EDGE && share < 1 - EDGE) {
      return onto(over);
    }
  }

  return areaMove({ dragged, point, boxes, area, noList });
};
