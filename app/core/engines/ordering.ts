import type { Group } from "../records/group.ts";
import type { Profile } from "../records/profile.ts";
import type { Tab } from "../records/tab.ts";

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const moveItem = <T>(
  items: readonly T[],
  from: number,
  to: number
): T[] => {
  if (items.length === 0) {
    return [];
  }
  const last = items.length - 1;
  const source = clamp(from, 0, last);
  const target = clamp(to, 0, last);
  const result = [...items];
  result.splice(target, 0, ...result.splice(source, 1));
  return result;
};

/** One row of a profile's tab list: a tab alone, or a group of several drawn as one unit. */
export type TabRow =
  | { readonly kind: "tab"; readonly tab: Tab }
  | {
      readonly kind: "group";
      readonly group: Group;
      readonly tabs: readonly Tab[];
    };

export const rowTabs = (row: TabRow): readonly Tab[] =>
  row.kind === "tab" ? [row.tab] : row.tabs;

const byOrder = (a: Profile, b: Profile) =>
  a.order - b.order || a.id.localeCompare(b.id);

export const orderedProfiles = (profiles: readonly Profile[]): Profile[] =>
  profiles.toSorted(byOrder);

export const groupOf = (
  tabId: string,
  groups: readonly Group[]
): Group | undefined => groups.find((group) => group.tabIds.includes(tabId));

/** A profile's tabs in sidebar order: the order of `tabs`, with a group of several in place of its first tab and its tabs in the group's order. */
export const orderedTabs = (
  tabs: readonly Tab[],
  groups: readonly Group[],
  profileId: string
): TabRow[] => {
  const own = tabs.filter((tab) => tab.profileId === profileId);
  const byId = new Map(own.map((tab) => [tab.id, tab]));
  const placed = new Set<string>();
  const rows: TabRow[] = [];
  for (const tab of own) {
    if (placed.has(tab.id)) {
      continue;
    }
    const group = groupOf(tab.id, groups);
    if (group === undefined || group.tabIds.length <= 1) {
      placed.add(tab.id);
      rows.push({ kind: "tab", tab });
      continue;
    }
    const members = group.tabIds.flatMap((id) => {
      const member = byId.get(id);
      return member === undefined || placed.has(id) ? [] : [member];
    });
    for (const member of members) {
      placed.add(member.id);
    }
    rows.push({ group, kind: "group", tabs: members });
  }
  return rows;
};

/** Moves the row holding `tabId` to row `to` of its profile, clamped to the list; a tab in a group moves with its group. */
export const moveTab = (
  tabs: readonly Tab[],
  groups: readonly Group[],
  tabId: string,
  to: number
): Tab[] => {
  const moving = tabs.find((tab) => tab.id === tabId);
  if (moving === undefined) {
    return [...tabs];
  }
  const rows = orderedTabs(tabs, groups, moving.profileId);
  const from = rows.findIndex((row) =>
    rowTabs(row).some((tab) => tab.id === tabId)
  );
  const reordered = moveItem(rows, from, to).flatMap(rowTabs).values();
  return tabs.map((tab) =>
    tab.profileId === moving.profileId ? (reordered.next().value ?? tab) : tab
  );
};

/** Moves a profile to position `to`, clamped, and numbers every profile's order from 0. */
export const moveProfile = (
  profiles: readonly Profile[],
  profileId: string,
  to: number
): Profile[] => {
  const ordered = orderedProfiles(profiles);
  const from = ordered.findIndex((profile) => profile.id === profileId);
  const moved = from === -1 ? ordered : moveItem(ordered, from, to);
  return moved.map((profile, order) => ({ ...profile, order }));
};
