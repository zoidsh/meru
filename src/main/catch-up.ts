import { throttle } from "es-toolkit";
import type { ThrottledFunction } from "es-toolkit";

import type { State } from "#core/state.ts";

/** How often at most a profile's page is told to catch up. */
export const CATCH_UP_INTERVAL = 2000;

/**
 * Tells a profile's Gmail page to catch up at most every 2 s: at once, and
 * once more when the 2 s are up if it was asked again meanwhile, so a burst
 * of actions costs two presses of Gmail's Refresh at most. Only an action or
 * a wake asks, never anything the page itself does, so it cannot loop.
 */
export const createCatchUp = (send: (profileId: string) => void) => {
  const throttled = new Map<string, ThrottledFunction<() => void>>();

  const request = (profileId: string) => {
    let catchUp = throttled.get(profileId);

    if (!catchUp) {
      catchUp = throttle(
        () => {
          send(profileId);
        },
        CATCH_UP_INTERVAL,
        { edges: ["leading", "trailing"] }
      );
      throttled.set(profileId, catchUp);
    }

    catchUp();
  };

  return {
    request,
    /** Asks for every listed profile, as after the computer wakes. */
    requestAll: (current: State) => {
      for (const profile of current.profiles) {
        request(profile.id);
      }
    },
    /** Drops what is pending for each profile no longer listed. */
    follow: (current: State) => {
      const listed = new Set(current.profiles.map((profile) => profile.id));

      for (const [profileId, catchUp] of throttled) {
        if (!listed.has(profileId)) {
          catchUp.cancel();
          throttled.delete(profileId);
        }
      }
    },
  };
};
