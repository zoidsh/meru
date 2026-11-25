import { z } from "zod/mini";

import { decodeVersioned } from "./store-file.ts";
import type { Decoded } from "./store-file.ts";

/**
 * Never changes. An older integer here reads as unreadable, so a bump would
 * set every person's entitlement aside. The shape only grows, a new field
 * optional and read leniently, so every build reads every file written
 * before it.
 */
export const ENTITLEMENT_VERSION = 1;

/**
 * `entitlement.json` as found: the signed token, the license key, and when
 * the key was first held with no token. Each is read where it has its shape
 * and kept as found where it has not, as is any key this build does not know.
 */
export type EntitlementFile = Readonly<Record<string, unknown>> & {
  readonly version: number;
};

const fileSchema = z.looseObject({
  version: z.literal(ENTITLEMENT_VERSION),
});

export const createInitialEntitlementFile = (): EntitlementFile => ({
  version: ENTITLEMENT_VERSION,
});

export const decodeEntitlementFile = (
  value: unknown
): Decoded<EntitlementFile> =>
  decodeVersioned(value, ENTITLEMENT_VERSION, fileSchema);

const stringField = (file: EntitlementFile, key: string) => {
  const value = file[key];

  return typeof value === "string" && value !== "" ? value : undefined;
};

export const storedToken = (file: EntitlementFile) =>
  stringField(file, "token");

export const storedLicenseKey = (file: EntitlementFile) =>
  stringField(file, "licenseKey");

export const storedKeyAt = (file: EntitlementFile) => {
  const value = file.keyStoredAt;

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

/** The file with a token the server just signed, for `licenseKey` if given. */
export const withToken = (
  file: EntitlementFile,
  token: string,
  licenseKey?: string
): EntitlementFile => {
  const { keyStoredAt: _, ...rest } = file;

  return {
    ...rest,
    version: file.version,
    token,
    ...(licenseKey !== undefined && { licenseKey }),
  };
};

/**
 * The file holding a key with no token yet, as the v3 importer stores one,
 * and the instant it was first held so.
 */
export const withUnconfirmedKey = (
  file: EntitlementFile,
  licenseKey: string,
  now: number
): EntitlementFile => {
  const { token: _, ...rest } = file;

  return { ...rest, version: file.version, licenseKey, keyStoredAt: now };
};
