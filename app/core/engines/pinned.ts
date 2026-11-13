import type { Tab } from "../records/tab.ts";

/** Whether the catalog keeps an app to one tab per profile, as it does Gmail. */
export type SingleInstance = (appId: string) => boolean;

/** A single-instance app's tab is pinned, as 3.x pins Gmail: its row comes first and it first in its group, and it is never closed, moved, taken out of its group or joined to another; other tabs may still split beside it. Derived from the catalog each time, never stored. */
export const isPinned = (
  tab: Pick<Tab, "appId">,
  singleInstance: SingleInstance
): boolean => singleInstance(tab.appId);
