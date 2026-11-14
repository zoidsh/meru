import { clamp } from "es-toolkit";
import { z } from "zod";

import type { Claims } from "./token.ts";
import { isExpired } from "./verify.ts";

/** How the API last answered. */
export const answerOutcomeSchema = z.enum([
  "issued",
  "offline",
  "rejected",
  "serverError",
  "invalid",
]);

type AnswerOutcome = z.infer<typeof answerOutcomeSchema>;

/** What of entitlement.json decides when the device asks the API next. */
export interface ScheduleState {
  readonly licenseKey: string | null;
  /** The license key the token was issued for, null for a trial. */
  readonly token: { readonly licenseKey: string | null } | null;
  /** The license key the API last refused, and when. */
  readonly rejected: {
    readonly at: number;
    readonly licenseKey: string;
  } | null;
  readonly lastAnswer: { readonly outcome: AnswerOutcome } | null;
}

/** How long a refresh that brought no token waits before the next, at first. */
export const RETRY_FIRST = 60_000;
/** The longest wait between refreshes, and how long a refused license key waits to be asked about again. */
export const RETRY_MAX = 3_600_000;

/** Whether the API refused the license key the device holds now. */
const keyRejected = (state: ScheduleState): boolean =>
  state.rejected !== null && state.rejected.licenseKey === state.licenseKey;

/** Whether the device holds a trial token, not one for a license key, whose trial has not ended. */
const trialRunning = (
  state: ScheduleState,
  claims: Claims | undefined,
  now: number
): boolean =>
  claims !== undefined &&
  state.token?.licenseKey === null &&
  claims.plan === "trial" &&
  claims.status === "active" &&
  (claims.endsAt ?? 0) * 1000 > now;

/** Whether the device is free whatever its token says: its license key was refused and it has no trial running. */
export const fallsBackToFree = (
  state: ScheduleState,
  claims: Claims | undefined,
  now: number
): boolean => keyRejected(state) && !trialRunning(state, claims, now);

const needsToken = (
  state: ScheduleState,
  claims: Claims | undefined,
  now: number
): boolean =>
  claims === undefined ||
  state.token?.licenseKey !== state.licenseKey ||
  isExpired(claims, now, 0);

/** The license key to ask the API about now, null for a trial; undefined when nothing is due. */
export const due = (
  state: ScheduleState,
  claims: Claims | undefined,
  now: number
): { readonly licenseKey: string | null } | undefined => {
  const { rejected } = state;
  if (rejected === null || !keyRejected(state)) {
    return needsToken(state, claims, now)
      ? { licenseKey: state.licenseKey }
      : undefined;
  }
  if (now >= rejected.at + RETRY_MAX) {
    return { licenseKey: rejected.licenseKey };
  }
  if (
    claims !== undefined &&
    trialRunning(state, claims, now) &&
    (state.lastAnswer?.outcome === "rejected" || isExpired(claims, now, 0))
  ) {
    return { licenseKey: null };
  }
  return undefined;
};

/** When to look again while nothing is due: the token's expiry, the trial's end or the hour after a refusal, whichever comes first; undefined when none is ahead. */
export const nextWake = (
  state: ScheduleState,
  claims: Claims | undefined,
  now: number
): number | undefined => {
  const ahead = [
    (claims?.exp ?? 0) * 1000,
    (claims?.endsAt ?? 0) * 1000,
    state.rejected === null ? 0 : state.rejected.at + RETRY_MAX,
  ].filter((time) => time > now);
  return ahead.length === 0 ? undefined : Math.min(...ahead);
};

/** How long the refresh after this one waits: none after a token, an hour after a refused trial, none after a refused license key, and twice the last wait, within bounds, after anything else. */
export const nextDelay = (
  delay: number,
  outcome: AnswerOutcome,
  licenseKey: string | null
): number => {
  if (outcome === "issued") {
    return 0;
  }
  if (outcome === "rejected") {
    return licenseKey === null ? RETRY_MAX : 0;
  }
  return clamp(delay * 2, RETRY_FIRST, RETRY_MAX);
};
