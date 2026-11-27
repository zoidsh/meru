import { splitBoxes } from "./split.ts";
import { isPinned, knownTabs } from "./state.ts";
import type { Profile, Tab } from "./state.ts";

interface DrawnTab {
  id: string;
  pinned?: boolean | undefined;
}

/**
 * One place in an area of the sidebar: a tab, or a split's box of tabs,
 * which stands at the place of `place`, one of its tabs.
 */
export type SidebarItem<T extends DrawnTab> =
  | { kind: "tab"; tab: T }
  | { kind: "box"; tabs: T[]; place: T };

export interface SidebarLayout<T extends DrawnTab> {
  pinned: SidebarItem<T>[];
  listed: SidebarItem<T>[];
  /** Each drawn box's tabs in its own order, in the splits' order. */
  boxes: T[][];
}

/**
 * The sidebar's two areas as drawn, from the shown tabs in stored order and
 * each split's box in its own order, in the splits' order. A box stands
 * where its first pinned tab stands, in the pinned area, and one with none
 * where its first tab stands, in the list; its other tabs have no place of
 * their own, so forming a split moves nothing ahead of the tabs above it. A
 * box of fewer than two shown tabs is none.
 */
export const sidebarLayout = <T extends DrawnTab>(
  tabs: readonly T[],
  boxes: readonly (readonly string[])[]
): SidebarLayout<T> => {
  const drawnBoxes = boxes
    .map((box) =>
      box.flatMap((tabId) => tabs.find((tab) => tab.id === tabId) ?? [])
    )
    .filter((box) => box.length > 1);
  const boxOf = new Map(
    drawnBoxes.flatMap((box) => box.map((tab) => [tab.id, box] as const))
  );
  const placed = new Set<T[]>();
  const layout: SidebarLayout<T> = {
    pinned: [],
    listed: [],
    boxes: drawnBoxes,
  };

  // In stored order, a box's first pinned tab comes before its other
  // pinned ones, and a box with none is placed at its first tab.
  for (const tab of tabs) {
    const box = boxOf.get(tab.id);
    const area = layout[isPinned(tab) ? "pinned" : "listed"];

    if (!box) {
      area.push({ kind: "tab", tab });
    } else if (!placed.has(box) && (isPinned(tab) || !box.some(isPinned))) {
      placed.add(box);
      area.push({ kind: "box", tabs: box, place: tab });
    }
  }

  return layout;
};

/** The tabs of an area, or of both, top to bottom as drawn. */
export const itemTabs = <T extends DrawnTab>(
  items: readonly SidebarItem<T>[]
): T[] =>
  items.flatMap((item) => (item.kind === "box" ? item.tabs : [item.tab]));

/**
 * The tabs the sidebar lists: all of them, or with Show windows in the
 * sidebar off those in the main window alone. Only the drawing leaves the
 * others out; every count and key reads the tabs as stored.
 */
export const listedTabs = <T extends { ownWindow: boolean }>(
  tabs: readonly T[],
  showWindows: boolean
): readonly T[] => (showWindows ? tabs : tabs.filter((tab) => !tab.ownWindow));

/**
 * The profile's shown tabs in the order the sidebar draws them, which Close
 * tabs below, the next and previous tab and the pinned shortcuts count in.
 */
export const drawnTabs = (profile: Pick<Profile, "tabs" | "splits">): Tab[] => {
  const { pinned, listed } = sidebarLayout(
    knownTabs(profile),
    splitBoxes(profile).map((box) => box.tabs)
  );

  return itemTabs([...pinned, ...listed]);
};

/**
 * The pinned area's tiles in runs, each box between two runs: the wide
 * sidebar's grid gives a box a row of its own and fills rows with each run
 * anew.
 */
export const pinnedRuns = <T extends DrawnTab>(
  items: readonly SidebarItem<T>[]
): T[][] => {
  const runs: T[][] = [[]];

  for (const item of items) {
    if (item.kind === "box") {
      runs.push([]);
    } else {
      runs.at(-1)?.push(item.tab);
    }
  }

  return runs.filter((run) => run.length > 0);
};

/**
 * Whether the pinned tile at `index` of a run of `count` spans both columns
 * of the wide sidebar's two: the last of an odd count, alone in its row.
 */
export const spansPinnedRow = (index: number, count: number) =>
  count % 2 === 1 && index === count - 1;

/**
 * The height of `count` tabs, the list keeping room for up to three, and the
 * inset above the first.
 */
export const listRoom = (count: number, gap: number) => {
  const rows = Math.min(count, 3);

  return rows === 0 ? 0 : 6 + rows * 32 + (rows - 1) * gap;
};

/**
 * Left or Right on the wide pinned tile at `index`: the index of the other
 * tile of its row, should the key point at it. A row holds an even index and
 * the next.
 */
export const sideways = (index: number, key: "ArrowLeft" | "ArrowRight") => {
  const right = key === "ArrowRight";

  if (right !== (index % 2 === 0)) {
    return;
  }

  return right ? index + 1 : index - 1;
};

/** The keys and modifiers of a key press. */
interface KeyPress {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

/**
 * Alt with Up or Down on a focused tab, or Left or Right on a tile of the
 * wide pinned grid, which moves it a place back or on in its area: Option
 * on macOS. Base UI's tablist leaves arrows with a modifier alone.
 */
export const moveStep = (event: KeyPress, grid: boolean) => {
  const steps: Record<string, number> = grid
    ? { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -1, ArrowRight: 1 }
    : { ArrowUp: -1, ArrowDown: 1 };

  return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
    ? steps[event.key]
    : undefined;
};
