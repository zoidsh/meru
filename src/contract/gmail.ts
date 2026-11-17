import { z } from "zod/mini";

import {
  GMAIL_FEATURES,
  GMAIL_VIEWS,
  HOOK_NAMES,
  HOOK_STATUSES,
} from "#core/gmail-hooks.ts";

export { GMAIL_CHANNELS, isGmailFeatures } from "./gmail-channels.ts";
export type { GmailFeatures, GmailHealth } from "./gmail-channels.ts";

/** Main to page: which of the page's features are on. */
export const GMAIL_FEATURES_SCHEMA = z.strictObject(
  Object.fromEntries(
    GMAIL_FEATURES.map((feature) => [feature, z.boolean()])
  ) as Record<(typeof GMAIL_FEATURES)[number], z.ZodMiniBoolean>
);

/** Page to main: what the health check found. Main takes it as a hint. */
export const GMAIL_HEALTH_SCHEMA = z.strictObject({
  views: z.array(z.enum(GMAIL_VIEWS)).check(z.maxLength(GMAIL_VIEWS.length)),
  hooks: z.record(z.enum(HOOK_NAMES), z.enum(HOOK_STATUSES)),
  ms: z.number().check(z.nonnegative(), z.lte(60_000)),
});
