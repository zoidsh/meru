import { tabKey } from "#core/tabs.ts";
import type { ViewPlan } from "#core/views.ts";

/** The longest a profile's Open at Launch tabs hold back the next one's. */
export const LAUNCH_TURN_MS = 15_000;

/**
 * Open at Launch one profile at a time: the profiles whose tabs were opened
 * this session, and the opened tabs still loading, which hold back the next
 * profile's until none is or the turn's cap is up.
 */
export const createLaunchTurn = ({
  isLoading,
  hasView,
  onTurnEnd,
}: {
  isLoading: (key: string) => boolean;
  hasView: (key: string) => boolean;
  onTurnEnd: () => void;
}) => {
  /** The profiles whose Open at Launch tabs were opened this session. */
  const launched = new Set<string>();
  /**
   * The Open at Launch tabs opened that are still loading; the next
   * profile's open once none is, or once the turn's cap is up.
   */
  const launchLoading = new Set<string>();
  /**
   * Ends a profile's turn should its tabs still load after
   * `LAUNCH_TURN_MS`, since a page can stay loading for good, waiting on
   * a request that never ends, and would hold back every later profile.
   */
  let launchCap: ReturnType<typeof setTimeout> | undefined;

  const endLaunchTurn = () => {
    clearTimeout(launchCap);
    launchCap = undefined;
    launchLoading.clear();
    setTimeout(onTurnEnd, 0);
  };

  return {
    launched: launched as ReadonlySet<string>,
    waiting: () => launchLoading.size > 0,
    /**
     * Takes the tab out of the launch's loading ones once it is no longer
     * loading, and opens the next profile's Open at Launch tabs on the next
     * turn, so no plan is made from inside one being applied.
     */
    settle: (key: string) => {
      if (isLoading(key)) {
        return;
      }

      if (launchLoading.delete(key) && launchLoading.size === 0) {
        endLaunchTurn();
      }
    },
    /** Starts the turn of the profiles the plan launches. */
    begin: (next: Pick<ViewPlan, "launched" | "opening">) => {
      for (const profileId of next.launched) {
        launched.add(profileId);
      }

      // A sleeping tab among them has no view to load.
      for (const key of next.opening.map(tabKey)) {
        if (hasView(key)) {
          launchLoading.add(key);
        }
      }

      if (next.launched.length > 0) {
        clearTimeout(launchCap);
        launchCap = setTimeout(endLaunchTurn, LAUNCH_TURN_MS);
      }
    },
    /** A profile gone to sleep opens its tabs again, in turn, once it wakes. */
    again: (profileId: string) => {
      launched.delete(profileId);
    },
  };
};
