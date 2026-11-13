import { z } from "zod";

import type { Group } from "../records/group.ts";
import type { Tab } from "../records/tab.ts";
import { panes } from "./layout.ts";
import { rowTabs } from "./ordering.ts";
import type { TabRow } from "./ordering.ts";

export const sidebarWidthSchema = z.enum(["auto", "narrow", "wide"]);

/** The width a user sets: one of the two, or `auto`, which picks between them. */
export type SidebarWidth = z.infer<typeof sidebarWidthSchema>;

/** One of the two widths the strip is ever drawn at. */
export type SidebarSize = Exclude<SidebarWidth, "auto">;

/** 3.x's widths: icons alone in eight steps of its 8px spacing, icon and title in 28. */
export const SIDEBAR_PIXELS: Readonly<Record<SidebarSize, number>> = {
  narrow: 64,
  wide: 224,
};

export const sidebarSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hidden") }),
  z.object({
    kind: z.literal("shown"),
    size: sidebarWidthSchema.exclude(["auto"]),
    width: z.number().int().positive(),
  }),
]);

/** Whether the strip is drawn, and how wide. */
export type Sidebar = z.infer<typeof sidebarSchema>;

export interface SidebarChoice {
  /** The profile's `sidebar.width`. */
  readonly width: SidebarWidth;
  /** Whether the user hid the strip for the profile. */
  readonly hidden: boolean;
  /** A width the user flipped to in the strip, which stands until the app quits. */
  readonly flipped: SidebarSize | null;
}

const autoSize = (tabs: readonly Tab[]): SidebarSize => {
  const counts = new Map<string, number>();
  for (const tab of tabs) {
    if (!tab.pinned) {
      counts.set(tab.appId, (counts.get(tab.appId) ?? 0) + 1);
    }
  }
  return [...counts.values()].some((count) => count > 1) ? "wide" : "narrow";
};

/** Whether a profile's tabs call for a strip at all: only when there is more than one to switch between. */
export const hasStrip = (tabs: readonly Tab[]): boolean => tabs.length > 1;

/** The strip for a profile's tabs: shown while `hasStrip` and the user has not hidden it, wide under `auto` once an app has several tabs, since icons alone no longer tell them apart. */
export const sidebarOf = (
  tabs: readonly Tab[],
  choice: SidebarChoice
): Sidebar => {
  if (!hasStrip(tabs) || choice.hidden) {
    return { kind: "hidden" };
  }
  const size =
    choice.flipped ?? (choice.width === "auto" ? autoSize(tabs) : choice.width);
  return { kind: "shown", size, width: SIDEBAR_PIXELS[size] };
};

/** What the strip takes from the left of the content area. */
export const sidebarInset = (sidebar: Sidebar): number =>
  sidebar.kind === "shown" ? sidebar.width : 0;

export const gmailUnreadBadgeSchema = z.enum([
  "always",
  "whenInactive",
  "never",
]);

/** When the Gmail row shows the profile's unread count. */
export type GmailUnreadBadge = z.infer<typeof gmailUnreadBadgeSchema>;

/** Whether the Gmail row shows its unread count: never while unread counts are off, and under `whenInactive` not while Gmail is in front, where the inbox shows it. */
export const showsGmailUnread = (options: {
  /** `profiles.unreadBadge`, which turns every unread count off. */
  readonly unreadBadge: boolean;
  /** `sidebar.gmailUnreadBadge`. */
  readonly mode: GmailUnreadBadge;
  readonly gmailActive: boolean;
}): boolean =>
  options.unreadBadge &&
  (options.mode === "always" ||
    (options.mode === "whenInactive" && !options.gmailActive));

/** The tab whose pane has focus, which its row shows as the active one. */
export const activeTabId = (
  groups: readonly Group[],
  focusedPaneId: string | null
): string | undefined => {
  for (const group of groups) {
    const pane = panes(group.layout).find(
      (found) => found.paneId === focusedPaneId
    );
    if (pane !== undefined) {
      return pane.tabIds[0];
    }
  }
  return undefined;
};

/** Where on a row a dragged tab is let go: its top or bottom quarter puts it between rows, the rest beside the row's pane. */
export type DropZone = "before" | "onto" | "after";

export interface DropTarget {
  readonly tabId: string;
  readonly zone: DropZone;
}

/** What letting go of a dragged tab does: `tabs.move` its row, `tabs.leave` its group for a row of its own, or `tabs.join` another tab's group. */
export type DropAction =
  | { readonly kind: "move"; readonly to: number }
  | { readonly kind: "leave"; readonly to: number }
  | { readonly kind: "join"; readonly targetTabId: string };

/** The zone of a row from `top` to `bottom` that a point at `y` is over. */
export const zoneAt = (top: number, bottom: number, y: number): DropZone => {
  const quarter = (bottom - top) / 4;
  if (y < top + quarter) {
    return "before";
  }
  return y > bottom - quarter ? "after" : "onto";
};

const holds = (wanted: string) => (row: TabRow) =>
  rowTabs(row).some((found) => found.id === wanted);

/** The change a drop of `tabId` on `target` makes to the rows, undefined for one that changes nothing; `to` is the row it ends at, as tabs.move and tabs.leave take it. */
export const dropAction = (
  rows: readonly TabRow[],
  tabId: string,
  target: DropTarget
): DropAction | undefined => {
  const from = rows.findIndex(holds(tabId));
  const at = rows.findIndex(holds(target.tabId));
  const source = rows[from];
  if (source === undefined || at === -1 || target.tabId === tabId) {
    return undefined;
  }
  if (target.zone === "onto") {
    return at === from
      ? undefined
      : { kind: "join", targetTabId: target.tabId };
  }
  const gap = target.zone === "before" ? at : at + 1;
  if (source.kind === "group") {
    return { kind: "leave", to: gap };
  }
  const to = gap > from ? gap - 1 : gap;
  return to === from ? undefined : { kind: "move", to };
};
