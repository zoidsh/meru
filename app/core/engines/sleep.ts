import type { Tab } from "../records/tab.ts";
import { isPinned } from "./pinned.ts";
import type { SingleInstance } from "./pinned.ts";

export interface SleepInput {
  readonly tabs: readonly Pick<Tab, "appId" | "id" | "sleeps">[];
  /** The tabs a pane of some window shows now. */
  readonly shown: ReadonlySet<string>;
  /** The tabs whose page is playing sound, which counts as in use, since its sound would stop with its view. */
  readonly audible: ReadonlySet<string>;
  /** When each tab was last shown or heard, as the last sweep left it. */
  readonly lastSeen: ReadonlyMap<string, number>;
  /** The tabs asleep before this sweep. */
  readonly asleep: ReadonlySet<string>;
  readonly now: number;
  /** How long a tab that lets itself sleep stays awake out of sight. */
  readonly after: number;
  readonly singleInstance: SingleInstance;
}

export interface SleepPlan {
  /** Every tab asleep once the sweep is carried out. */
  readonly asleep: ReadonlySet<string>;
  /** The tabs to put to sleep now, a subset of `asleep`. */
  readonly fallAsleep: readonly string[];
  readonly lastSeen: ReadonlyMap<string, number>;
  /** When the next tab is due to sleep, or null while none can, so nothing need wake to sweep again. */
  readonly next: number | null;
}

/** Whether a tab may sleep at all: the user let it, and it is not pinned, since Gmail's loaded page is what keeps the profile's session cookies fresh. */
export const maySleep = (
  tab: Pick<Tab, "appId" | "sleeps">,
  singleInstance: SingleInstance
): boolean => tab.sleeps && !isPinned(tab, singleInstance);

/** Decides which tabs sleep: one the user let sleep, out of sight and silent for `after`, falls asleep; a tab a pane shows is awake, and every other keeps its state. */
export const sweep = (input: SleepInput): SleepPlan => {
  const { after, audible, now, shown, singleInstance } = input;
  const asleep = new Set<string>();
  const fallAsleep: string[] = [];
  const lastSeen = new Map<string, number>();
  let next: number | null = null;
  for (const tab of input.tabs) {
    const inUse = shown.has(tab.id) || audible.has(tab.id);
    const seen = inUse ? now : (input.lastSeen.get(tab.id) ?? now);
    lastSeen.set(tab.id, seen);
    if (shown.has(tab.id)) {
      continue;
    }
    if (input.asleep.has(tab.id)) {
      asleep.add(tab.id);
      continue;
    }
    if (!maySleep(tab, singleInstance)) {
      continue;
    }
    const due = seen + after;
    if (due <= now) {
      asleep.add(tab.id);
      fallAsleep.push(tab.id);
    } else {
      next = next === null ? due : Math.min(next, due);
    }
  }
  return { asleep, fallAsleep, lastSeen, next };
};
