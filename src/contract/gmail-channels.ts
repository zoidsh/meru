// Apart from the schemas in gmail.ts, so Gmail's preload carries no zod.

import { GMAIL_FEATURES } from "#core/gmail-hooks.ts";
import type {
  GmailFeatures,
  GmailView,
  HookName,
  HookStatus,
} from "#core/gmail-hooks.ts";

export type { GmailFeatures } from "#core/gmail-hooks.ts";

export const GMAIL_CHANNELS = {
  /** Page to main: the handshake, with no payload. */
  sync: "gmail:sync",
  /** Main to page: `GmailFeatures`, after the handshake and on every change. */
  features: "gmail:features",
  /** Page to main: a `GmailHealth`, when it differs from the last one sent. */
  health: "gmail:health",
  /**
   * Main to page, with no payload: show what changed in the mailbox, by
   * Gmail's own Refresh, never a reload.
   */
  catchUp: "gmail:catch-up",
} as const;

/** What the page found once a view settled. */
export interface GmailHealth {
  views: GmailView[];
  hooks: Record<HookName, HookStatus>;
  /** How long the check took. */
  ms: number;
}

/** The page's check of a features message, the same as main's schema. */
export const isGmailFeatures = (value: unknown): value is GmailFeatures => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const keys = Object.keys(value);

  return (
    keys.length === GMAIL_FEATURES.length &&
    GMAIL_FEATURES.every(
      (feature) =>
        Object.hasOwn(value, feature) &&
        typeof (value as Record<string, unknown>)[feature] === "boolean"
    )
  );
};
