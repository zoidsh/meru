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
 * of a tile, nor where the tab would land in its own place.
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
    own === -1 || index === own || index === own + 1
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
