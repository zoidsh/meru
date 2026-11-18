import { boxOrder } from "./split.ts";
import { knownTabs } from "./state.ts";
import type { Profile, Tab } from "./state.ts";

interface DrawnTab {
  id: string;
  pinned?: boolean | undefined;
}

/** One place in an area of the sidebar: a tab, or the split's box of tabs. */
export type SidebarItem<T extends DrawnTab> =
  | { kind: "tab"; tab: T }
  | { kind: "box"; tabs: T[] };

export interface SidebarLayout<T extends DrawnTab> {
  pinned: SidebarItem<T>[];
  listed: SidebarItem<T>[];
  /** The box's tabs in its own order, or none when no box is drawn. */
  box: T[];
}

const isPinned = (tab: DrawnTab) => tab.pinned === true;

/**
 * The sidebar's two areas as drawn, from the shown tabs in stored order and
 * the split's box in its own order. The box goes first in the pinned area
 * when it holds a pinned tab, and otherwise in the list where its first tab
 * stands; a box of fewer than two shown tabs is none.
 */
export const sidebarLayout = <T extends DrawnTab>(
  tabs: readonly T[],
  box: readonly string[] | undefined
): SidebarLayout<T> => {
  const boxTabs = (box ?? []).flatMap(
    (tabId) => tabs.find((tab) => tab.id === tabId) ?? []
  );
  const boxed = new Set(boxTabs.length > 1 ? boxTabs.map((tab) => tab.id) : []);
  const boxItem: SidebarItem<T> = { kind: "box", tabs: boxTabs };
  const boxPinned = boxed.size > 0 && boxTabs.some(isPinned);
  const layout: SidebarLayout<T> = {
    pinned: boxPinned ? [boxItem] : [],
    listed: [],
    box: boxed.size > 0 ? boxTabs : [],
  };

  for (const tab of tabs) {
    if (!boxed.has(tab.id)) {
      layout[isPinned(tab) ? "pinned" : "listed"].push({ kind: "tab", tab });
    } else if (!boxPinned && !layout.listed.includes(boxItem)) {
      layout.listed.push(boxItem);
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
export const drawnTabs = (profile: Pick<Profile, "tabs" | "split">): Tab[] => {
  const { pinned, listed } = sidebarLayout(
    knownTabs(profile),
    boxOrder(profile)
  );

  return itemTabs([...pinned, ...listed]);
};
