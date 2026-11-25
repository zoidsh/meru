// Apart from the schemas in entitlement.ts, so a preload, which needs only
// these names, carries no zod.

/**
 * The calls a renderer showing Meru Pro may make. A contract that serves them
 * spreads these names into its own.
 */
export const ENTITLEMENT_CALL_NAMES = [
  "activateLicense",
  "setDeviceName",
  "retryEntitlement",
] as const;

export type EntitlementCallName = (typeof ENTITLEMENT_CALL_NAMES)[number];
