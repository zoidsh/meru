import { clamp } from "es-toolkit";

import type { Group } from "../records/group.ts";
import type { Profile } from "../records/profile.ts";
import type { Tab } from "../records/tab.ts";
import { panes } from "./layout.ts";
import { isPinned } from "./pinned.ts";
import type { SingleInstance } from "./pinned.ts";

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

export const orderedProfiles = <P extends Profile>(
  profiles: readonly P[]
): P[] => profiles.toSorted(byOrder);

export const groupOf = (
  tabId: string,
  groups: readonly Group[]
): Group | undefined => groups.find((group) => group.tabIds.includes(tabId));

/** A profile's tabs in sidebar order: the order of `tabs`, with a group of several in place of its first tab and its tabs in the order of its layout's panes, so the rows follow a drop or a swap; a pinned tab's row comes first, and the pinned tab first in its group, whatever joins or leaves it. */
export const orderedTabs = (
  tabs: readonly Tab[],
  groups: readonly Group[],
  profileId: string,
  singleInstance: SingleInstance
): TabRow[] => {
  const pinned = (tab: Tab) => Number(isPinned(tab, singleInstance));
  const rowPinned = (row: TabRow) => Math.max(0, ...rowTabs(row).map(pinned));
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
    const members = panes(group.layout)
      .flatMap((pane) => pane.tabIds)
      .flatMap((id) => {
        const member = byId.get(id);
        return member === undefined || placed.has(id) ? [] : [member];
      });
    for (const member of members) {
      placed.add(member.id);
    }
    rows.push({
      group,
      kind: "group",
      tabs: members.toSorted((a, b) => pinned(b) - pinned(a)),
    });
  }
  return rows.toSorted((a, b) => rowPinned(b) - rowPinned(a));
};

/** Moves the row holding `tabId` to row `to` of its profile, clamped to the list below the pinned rows; a tab in a group moves with its group, and a pinned row stays. */
export const moveTab = (
  tabs: readonly Tab[],
  groups: readonly Group[],
  tabId: string,
  to: number,
  singleInstance: SingleInstance
): Tab[] => {
  const moving = tabs.find((tab) => tab.id === tabId);
  if (moving === undefined) {
    return [...tabs];
  }
  const rows = orderedTabs(tabs, groups, moving.profileId, singleInstance);
  const rowPinned = (found: TabRow) =>
    rowTabs(found).some((tab) => isPinned(tab, singleInstance));
  const from = rows.findIndex((found) =>
    rowTabs(found).some((tab) => tab.id === tabId)
  );
  const pinned = rows.filter(rowPinned).length;
  const row = rows[from];
  if (row === undefined || rowPinned(row)) {
    return [...tabs];
  }
  const reordered = moveItem(rows, from, Math.max(to, pinned))
    .flatMap(rowTabs)
    .values();
  return tabs.map((tab) =>
    tab.profileId === moving.profileId ? (reordered.next().value ?? tab) : tab
  );
};

/** The id `by` steps from `current` in `ids`, wrapping at either end; the first when `current` is not among them. */
export const stepFrom = (
  ids: readonly string[],
  current: string,
  by: 1 | -1
): string | undefined => {
  const at = ids.indexOf(current);
  if (at === -1) {
    return ids[0];
  }
  return ids[(at + by + ids.length) % ids.length];
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
