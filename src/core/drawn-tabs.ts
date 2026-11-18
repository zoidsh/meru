import { splitBoxes } from "./split.ts";
import { knownTabs } from "./state.ts";
import type { Profile, Tab } from "./state.ts";

interface DrawnTab {
  id: string;
  pinned?: boolean | undefined;
}

/** One place in an area of the sidebar: a tab, or a split's box of tabs. */
export type SidebarItem<T extends DrawnTab> =
  | { kind: "tab"; tab: T }
  | { kind: "box"; tabs: T[] };

export interface SidebarLayout<T extends DrawnTab> {
  pinned: SidebarItem<T>[];
  listed: SidebarItem<T>[];
  /** Each drawn box's tabs in its own order, in the splits' order. */
  boxes: T[][];
}

const isPinned = (tab: DrawnTab) => tab.pinned === true;

/**
 * The sidebar's two areas as drawn, from the shown tabs in stored order and
 * each split's box in its own order, in the splits' order. Every box
 * holding a pinned tab goes first in the pinned area, in the splits' order,
 * before the plain pinned tiles; any other goes in the list where its first
 * tab stands. A box of fewer than two shown tabs is none.
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
  const items = new Map(
    drawnBoxes.flatMap((box) => {
      const item: SidebarItem<T> = { kind: "box", tabs: box };

      return box.map((tab) => [tab.id, item] as const);
    })
  );
  const layout: SidebarLayout<T> = {
    pinned: drawnBoxes
      .filter((box) => box.some(isPinned))
      .map((box) => items.get(box[0]?.id ?? "") as SidebarItem<T>),
    listed: [],
    boxes: drawnBoxes,
  };

  for (const tab of tabs) {
    const item = items.get(tab.id);

    if (!item) {
      layout[isPinned(tab) ? "pinned" : "listed"].push({ kind: "tab", tab });
    } else if (!layout.pinned.includes(item) && !layout.listed.includes(item)) {
      layout.listed.push(item);
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
