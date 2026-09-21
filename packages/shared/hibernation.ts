/**
 * How long something sits unused before it is unloaded. The workspace apps
 * sweep and the Gmail one are separate settings; the durations they offer are
 * the same list, and a value added here has to mean the same thing to both.
 *
 * Keys double as durations for `ms`.
 */
export const hibernationTimeouts = {
  "1m": "1 minute",
  "30m": "30 minutes",
  "1h": "1 hour",
  "3h": "3 hours",
  "6h": "6 hours",
} as const;

export type HibernationTimeout = keyof typeof hibernationTimeouts;

/**
 * A minute is too short to ship — a tab left alone for the length of a phone
 * call would hibernate — but it's the only way to watch an idle sweep happen
 * without waiting half an hour, so the settings UI offers it in a development
 * run and nowhere else.
 */
export const DEV_HIBERNATION_TIMEOUT: HibernationTimeout = "1m";
