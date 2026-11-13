import { z } from "zod";

import type { Tab } from "../records/tab.ts";

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
    size: z.enum(["narrow", "wide"]),
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

/** The strip for a profile's tabs: shown only when there is more than one to switch between, wide under `auto` once an app has several tabs, since icons alone no longer tell them apart. */
export const sidebarOf = (
  tabs: readonly Tab[],
  choice: SidebarChoice
): Sidebar => {
  if (tabs.length <= 1 || choice.hidden) {
    return { kind: "hidden" };
  }
  const size =
    choice.flipped ?? (choice.width === "auto" ? autoSize(tabs) : choice.width);
  return { kind: "shown", size, width: SIDEBAR_PIXELS[size] };
};

/** What the strip takes from the left of the content area. */
export const sidebarInset = (sidebar: Sidebar): number =>
  sidebar.kind === "shown" ? sidebar.width : 0;
