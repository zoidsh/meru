import { z } from "zod/mini";

import type { Tier } from "./entitlement.ts";
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
 * `entitlement.json` as found: the signed token, the license key, when the
 * key was first held with no token, and when the person chose the free
 * version after a trial. Each is read where it has its shape
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

const instantField = (file: EntitlementFile, key: string) => {
  const value = file[key];

  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
};

export const storedKeyAt = (file: EntitlementFile) =>
  instantField(file, "keyStoredAt");

export const storedContinuedFreeAt = (file: EntitlementFile) =>
  instantField(file, "continuedFreeAt");

/**
 * The file with a token the server just signed, of `tier`, for `licenseKey`
 * if given. A token that grants more than free clears the choice of the
 * free version, so a trial or license that lapses later asks again.
 */
export const withToken = (
  file: EntitlementFile,
  token: string,
  { tier, licenseKey }: { tier: Tier; licenseKey?: string | undefined }
): EntitlementFile => {
  const { keyStoredAt: _, continuedFreeAt, ...rest } = file;

  return {
    ...rest,
    version: file.version,
    token,
    ...(licenseKey !== undefined && { licenseKey }),
    ...(tier === "free" &&
      continuedFreeAt !== undefined && { continuedFreeAt }),
  };
};

/** The file once the person chose the free version after a trial. */
export const withContinuedFree = (
  file: EntitlementFile,
  now: number
): EntitlementFile => ({ ...file, continuedFreeAt: now });

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
