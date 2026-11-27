import {
  ROTATION_LIFETIME,
  dueKeepAlive,
  rotatedAt,
} from "#core/keep-alive.ts";
import type { KeepAliveTiming } from "#core/keep-alive.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import { profilePartition } from "#core/state.ts";
import type { HiddenPage, KeepAlivePages } from "#platform/keep-alive.ts";

export interface KeepAliveDeps {
  pages: KeepAlivePages;
  profileIds: () => readonly string[];
  /** Whether the profile has a view of its own, whose page rotates the cookie. */
  hasView: (profileId: string) => boolean;
  signedOut: (profileId: string) => boolean;
  isOnline: () => boolean;
  /** Guards the session's permissions before its first page loads. */
  prepareSession: (partition: string) => void;
  url: string;
  cookie: string;
  timing: KeepAliveTiming;
  now: () => number;
  log: Log;
}

/**
 * Keeps each profile's Google sign-in from going stale while nothing of it is
 * loaded: when its rotating cookie has gone unrotated too long, loads the
 * rotation page in its session, hidden, until the cookie rotates or the
 * timeout passes, one profile at a time. When the cookie last rotated is read
 * from its expiry at launch and followed as the session sets it, whatever
 * page set it.
 */
export const createKeepAlive = ({
  pages,
  profileIds,
  hasView,
  signedOut,
  isOnline,
  prepareSession,
  url,
  cookie,
  timing,
  now,
  log,
}: KeepAliveDeps) => {
  const rotated = new Map<string, number>();
  const failed = new Map<string, number>();
  const watches = new Map<string, () => void>();
  let running:
    | {
        profileId: string;
        page: HiddenPage;
        timeout: ReturnType<typeof setTimeout>;
      }
    | undefined;

  const finish = () => {
    if (!running) {
      return;
    }

    clearTimeout(running.timeout);
    running.page.close();
    running = undefined;
  };

  const check = () => {
    const ids = profileIds();
    const profileId = dueKeepAlive(
      {
        profileIds: ids,
        rotated,
        failed,
        withViews: new Set(ids.filter(hasView)),
        signedOut: new Set(ids.filter(signedOut)),
        online: isOnline(),
        running: running !== undefined,
        now: now(),
      },
      timing
    );

    if (profileId === undefined) {
      return;
    }

    const partition = profilePartition(profileId);

    log("keep-alive-started", { profile: scrub.profile(profileId) });

    try {
      prepareSession(partition);
      running = {
        profileId,
        page: pages.open(partition, url, log),
        timeout: setTimeout(() => {
          log("keep-alive-timed-out", { profile: scrub.profile(profileId) });
          failed.set(profileId, now());
          finish();
          check();
        }, timing.timeout),
      };
    } catch (error) {
      log("keep-alive-failed", {
        profile: scrub.profile(profileId),
        code: scrub.code(error),
      });
      failed.set(profileId, now());
    }
  };

  const noteRotation = (profileId: string, at: number) => {
    rotated.set(profileId, Math.max(at, rotated.get(profileId) ?? at));
  };

  const readRotation = async (profileId: string, partition: string) => {
    try {
      const at = rotatedAt(await pages.readExpiries(partition, cookie));

      if (at !== undefined && watches.has(profileId)) {
        noteRotation(profileId, at);
      }
    } catch (error) {
      log("keep-alive-read-failed", {
        profile: scrub.profile(profileId),
        error: scrub.error(error),
      });
    }
  };

  const watch = (profileId: string) => {
    const partition = profilePartition(profileId);

    watches.set(
      profileId,
      pages.watchCookie(partition, cookie, (expiresAt) => {
        // Signed out: nothing to keep alive until a sign-in sets it again.
        if (expiresAt === undefined) {
          rotated.delete(profileId);

          return;
        }

        noteRotation(profileId, expiresAt - ROTATION_LIFETIME);
        failed.delete(profileId);

        if (running?.profileId === profileId) {
          finish();
          check();
        }
      })
    );
    void readRotation(profileId, partition);
  };

  /**
   * Follows the profiles and their views: a profile's cookie is watched while
   * it is listed, and its keep-alive closes once it is removed or has a view
   * of its own, whose page rotates the cookie.
   */
  const follow = () => {
    const listed = new Set(profileIds());

    for (const profileId of listed) {
      if (!watches.has(profileId)) {
        watch(profileId);
      }
    }

    for (const [profileId, stop] of watches) {
      if (!listed.has(profileId)) {
        stop();
        watches.delete(profileId);
        rotated.delete(profileId);
        failed.delete(profileId);
      }
    }

    if (
      running &&
      (!listed.has(running.profileId) || hasView(running.profileId))
    ) {
      finish();
    }
  };

  follow();

  let interval: ReturnType<typeof setInterval> | undefined;
  const first = setTimeout(() => {
    check();
    interval = setInterval(check, timing.interval);
  }, timing.firstCheck);

  return {
    follow,
    dispose: () => {
      clearTimeout(first);
      clearInterval(interval);
      finish();

      for (const stop of watches.values()) {
        stop();
      }

      watches.clear();
    },
  };
};
