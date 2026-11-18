const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The part of a Google sign-in that goes stale: only a loaded Google page
 * rotates it, every 10 minutes, and the feed poll never does.
 */
export const ROTATING_COOKIE = "__Secure-1PSIDTS";

/**
 * Google sets the rotating cookie to expire exactly 365 days after each
 * rotation, so its expiry says when it last rotated and nothing need be
 * stored.
 */
export const ROTATION_LIFETIME = 365 * DAY;

/**
 * The page Gmail embeds to rotate the cookie. Loaded on its own, it rotates a
 * value older than 10 minutes within a second, in a renderer far smaller than
 * Gmail's.
 */
export const KEEP_ALIVE_URL =
  "https://accounts.google.com/RotateCookiesPage?og_pid=23&rot=3&origin=https%3A%2F%2Fmail.google.com&exp_id=0";

export interface KeepAliveTiming {
  /** How long the cookie may go unrotated before a keep-alive is due. */
  age: number;
  /** From launch to the first check. */
  firstCheck: number;
  /** Between checks, which read the wall clock, so sleep is caught up. */
  interval: number;
  /** How long a keep-alive's page may wait for the rotation. */
  timeout: number;
  /** How long after a keep-alive that did not rotate the profile is tried again. */
  retry: number;
}

/**
 * Two days, since a value two days old was the oldest measured still to
 * rotate.
 */
export const KEEP_ALIVE_TIMING: KeepAliveTiming = {
  age: 2 * DAY,
  firstCheck: MINUTE,
  interval: HOUR,
  timeout: MINUTE,
  retry: HOUR,
};

/** When the cookies whose expiries these are last rotated, if any is set. */
export const rotatedAt = (expiries: readonly number[]) =>
  expiries.length === 0 ? undefined : Math.max(...expiries) - ROTATION_LIFETIME;

export interface KeepAliveFacts {
  /** The profiles, in their order. */
  profileIds: readonly string[];
  /** When each profile's cookie last rotated; none for one never signed in. */
  rotated: ReadonlyMap<string, number>;
  /** When each profile's last keep-alive ended without a rotation. */
  failed: ReadonlyMap<string, number>;
  /** The profiles with a view of their own, whose pages rotate the cookie. */
  withViews: ReadonlySet<string>;
  /** The profiles whose mail says they are signed out. */
  signedOut: ReadonlySet<string>;
  online: boolean;
  /** Whether a keep-alive runs now; one runs at a time. */
  running: boolean;
  now: number;
}

/**
 * The profile whose sign-in to keep alive now, the stalest of those due: one
 * whose cookie has gone `age` unrotated, with no view, not signed out, and not
 * tried in the last `retry`. None while one runs or offline.
 */
export const dueKeepAlive = (
  {
    profileIds,
    rotated,
    failed,
    withViews,
    signedOut,
    online,
    running,
    now,
  }: KeepAliveFacts,
  { age, retry }: KeepAliveTiming
): string | undefined => {
  if (running || !online) {
    return undefined;
  }

  let due: { profileId: string; at: number } | undefined;

  for (const profileId of profileIds) {
    const at = rotated.get(profileId);
    const triedAt = failed.get(profileId);

    if (
      at !== undefined &&
      now - at >= age &&
      !withViews.has(profileId) &&
      !signedOut.has(profileId) &&
      (triedAt === undefined || now - triedAt >= retry) &&
      (due === undefined || at < due.at)
    ) {
      due = { profileId, at };
    }
  }

  return due?.profileId;
};
