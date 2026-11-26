import { followIdle, idleSleepPlan } from "#core/idle-sleep.ts";
import type { SleepAfter, SleepIdleTabs } from "#core/settings.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";

export interface IdleSleepDeps {
  /** Main's state as the views read it. */
  state: () => State;
  which: () => SleepIdleTabs;
  after: () => SleepAfter;
  hasPage: (key: TabKey) => boolean;
  audible: (key: TabKey) => boolean;
  /** Sleep in the tab's menu. */
  sleep: (key: TabKey) => void;
  /** The wall clock, so time the computer slept counts as idle. */
  now: () => number;
}

/**
 * Puts each tab to sleep once it has been hidden for the time the settings
 * choose, through the same path as Sleep in its menu. One timer for every
 * tab, set for the next one due and none while no tab could sleep; `follow`
 * after anything that changes which tabs show, have a page, or the settings,
 * and after the computer wakes.
 */
export const createIdleSleep = ({
  state,
  which,
  after,
  hasPage,
  audible,
  sleep,
  now,
}: IdleSleepDeps) => {
  let idleSince = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const follow = () => {
    const current = state();
    const at = now();

    idleSince = followIdle(idleSince, current, at);

    const plan = idleSleepPlan({
      state: current,
      idleSince,
      which: which(),
      after: after(),
      now: at,
      hasPage,
      audible,
    });

    for (const key of plan.due) {
      sleep(key);
    }

    clearTimeout(timer);
    timer =
      plan.next === undefined ? undefined : setTimeout(follow, plan.next - at);
  };

  return {
    follow,
    dispose: () => {
      clearTimeout(timer);
      timer = undefined;
    },
  };
};
