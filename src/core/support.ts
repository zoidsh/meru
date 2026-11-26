/**
 * Where a person writes to Meru's support: the address v3's Help menu
 * writes to. Change it here alone.
 */
export const SUPPORT_ADDRESS = "tim@meru.so";

/** A `mailto:` link to support with `subject` filled in. */
export const supportMailto = (subject: string) =>
  `mailto:${SUPPORT_ADDRESS}?subject=${encodeURIComponent(subject)}`;
