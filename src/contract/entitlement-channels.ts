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
  "copyLicenseKey",
  "continueFree",
  "openMeruPro",
] as const;

export type EntitlementCallName = (typeof ENTITLEMENT_CALL_NAMES)[number];

/** The calls of the main window's trial-ended screen and license notice. */
export const SHELL_ENTITLEMENT_CALL_NAMES = [
  "activateLicense",
  "retryEntitlement",
  "continueFree",
  "openMeruPro",
] as const satisfies readonly EntitlementCallName[];
