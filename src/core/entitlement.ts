import { z } from "zod/mini";

import { nextLocalDay, trialDaysLeft } from "./trial-days.ts";

/**
 * What a free install lacks, in the order they are to be gated. `profiles`
 * is more than one profile, and with it profile sleep and per-profile
 * settings; `gmailPageSettings` is v3's Pro switches on Gmail's page, the
 * extended dark theme among them though it is on by default;
 * `incomingLinks` is Meru as the default mail client and links sent to it;
 * `workspaceAppNotifications` is notifications from Google's apps other than
 * Gmail.
 */
export const CAPABILITIES = [
  "profiles",
  "unifiedInbox",
  "notificationGates",
  "verificationCodes",
  "notificationSound",
  "savedSearches",
  "userStyles",
  "messageLink",
  "workspaceApps",
  "splitView",
  "shortcutCustomization",
  "blocker",
  "linkConfirmation",
  "gmailPageSettings",
  "bookmarks",
  "screenSharePicker",
  "extensions",
  "incomingLinks",
  "labelColors",
  "workspaceAppNotifications",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export const TIERS = ["free", "trial", "pro"] as const;

export type Tier = (typeof TIERS)[number];

/** The server names the tier; what each tier holds is the app's to say. */
export const tierCan = (tier: Tier, _capability: Capability) => tier !== "free";

export const DAY = 24 * 60 * 60 * 1000;

/** How long a token holds with no contact, and a key the importer stored with none. */
export const OFFLINE_GRACE = 14 * DAY;

/** A clock this far behind a token's issue reads as wrong rather than as late. */
export const CLOCK_TOLERANCE = DAY;

/** Why the server gave no token. */
export const SERVER_REFUSALS = [
  /** No license has this key. */
  "invalidKey",
  /** The license was refunded, disabled or has expired. */
  "refused",
  /** The license is in use on as many devices as it allows. */
  "deviceLimit",
  /** No answer: no network, or the server failed. */
  "offline",
] as const;

export type ServerRefusal = (typeof SERVER_REFUSALS)[number];

/** Why an activation or a rename failed: a key out of shape, or the server's reason. */
export const ENTITLEMENT_ERRORS = [
  "malformed",
  /** A rename with no license on this computer to rename it on. */
  "noLicense",
  ...SERVER_REFUSALS,
] as const;

export type EntitlementError = (typeof ENTITLEMENT_ERRORS)[number];

/** What the server signs. Its fields only grow. */
export const entitlementSchema = z.looseObject({
  v: z.literal(1),
  tier: z.enum(TIERS),
  deviceId: z.string(),
  issuedAt: z.number(),
  expiresAt: z.number(),
  trialEndsAt: z.optional(z.number()),
  /** Who the license is for, as the server words it. */
  licensee: z.optional(z.string()),
  deviceLabel: z.optional(z.string()),
  /** Why a token is free. */
  reason: z.optional(z.enum(["trialEnded", "licenseRefused"])),
});

export type Entitlement = z.output<typeof entitlementSchema>;

export const ENTITLEMENT_STATUSES = [
  "none",
  /** A key the importer carried from v3, not yet confirmed by the server. */
  "provisional",
  "trial",
  "trialEnded",
  "licensed",
  /** The server refused the license: a refund, or this device removed from it. */
  "refused",
  "unconfirmed",
] as const;

export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number];

/**
 * Why a Pro or trial install could not be confirmed: no contact for the
 * grace period, or a clock that reads well before the token was issued.
 */
export const UNCONFIRMED_REASONS = ["offline", "clock"] as const;

export type UnconfirmedReason = (typeof UNCONFIRMED_REASONS)[number];

export interface EntitlementView {
  status: EntitlementStatus;
  tier: Tier;
  unconfirmedReason: UnconfirmedReason | null;
  /**
   * Calendar days in the device's calendar to the trial's last day: 0 on
   * it, 1 the day before. `null` without a running trial.
   */
  trialDaysLeft: number | null;
  licensee: string | null;
  deviceLabel: string | null;
  /** When the server last confirmed this install: the token's issue. */
  lastConfirmed: number | null;
}

/** What the entitlement store holds, as the service reads it. */
export interface EntitlementRecord {
  /** Already verified for this device; absent with none that verifies. */
  token?: Entitlement;
  licenseKey?: string;
  /** When the store first held `licenseKey` with no token for it. */
  keyStoredAt?: number;
}

const view = (
  status: EntitlementStatus,
  token: Entitlement | undefined,
  fields: Partial<EntitlementView> = {}
): EntitlementView => ({
  status,
  tier: "free",
  unconfirmedReason: null,
  trialDaysLeft: null,
  licensee: token?.licensee ?? null,
  deviceLabel: token?.deviceLabel ?? null,
  lastConfirmed: token?.issuedAt ?? null,
  ...fields,
});

const unconfirmed = (
  token: Entitlement | undefined,
  reason: UnconfirmedReason
) => view("unconfirmed", token, { unconfirmedReason: reason });

const fromProvisional = (record: EntitlementRecord, now: number) => {
  const storedAt = record.keyStoredAt;

  // Only the importer stores a key with no token, and it says when.
  if (storedAt === undefined) {
    return unconfirmed(undefined, "offline");
  }

  if (now < storedAt - CLOCK_TOLERANCE) {
    return unconfirmed(undefined, "clock");
  }

  return now < storedAt + OFFLINE_GRACE
    ? view("provisional", undefined, { tier: "pro" })
    : unconfirmed(undefined, "offline");
};

/**
 * Where the entitlement stands at `now`, from what the store holds. Days are
 * counted in `timeZone`, the device's own when none is given.
 */
export const entitlementAt = (
  record: EntitlementRecord,
  now: number,
  timeZone?: string
): EntitlementView => {
  const { token } = record;

  if (!token) {
    return record.licenseKey === undefined
      ? view("none", undefined)
      : fromProvisional(record, now);
  }

  if (token.tier === "free") {
    return view(
      token.reason === "licenseRefused" ? "refused" : "trialEnded",
      token
    );
  }

  const trialEnded =
    token.tier === "trial" &&
    (token.trialEndsAt === undefined || now >= token.trialEndsAt);

  if (trialEnded) {
    return view("trialEnded", token);
  }

  if (now < token.issuedAt - CLOCK_TOLERANCE) {
    return unconfirmed(token, "clock");
  }

  if (now >= token.expiresAt) {
    return unconfirmed(token, "offline");
  }

  if (token.tier === "pro") {
    return view("licensed", token, { tier: "pro" });
  }

  return view("trial", token, {
    tier: "trial",
    trialDaysLeft: trialDaysLeft(Number(token.trialEndsAt), now, timeZone),
  });
};

/**
 * The next instant after `now` at which `entitlementAt` can answer
 * differently with the record unchanged, or `undefined` for none.
 */
export const nextChangeAt = (
  record: EntitlementRecord,
  now: number,
  timeZone?: string
) => {
  const { token } = record;
  const candidates: number[] = [];

  if (!token) {
    if (record.licenseKey !== undefined && record.keyStoredAt !== undefined) {
      candidates.push(
        record.keyStoredAt - CLOCK_TOLERANCE,
        record.keyStoredAt + OFFLINE_GRACE
      );
    }
  } else if (
    token.tier !== "free" &&
    entitlementAt(record, now, timeZone).status !== "trialEnded"
  ) {
    candidates.push(token.issuedAt - CLOCK_TOLERANCE, token.expiresAt);

    if (token.trialEndsAt !== undefined) {
      candidates.push(token.trialEndsAt, nextLocalDay(now, timeZone));
    }
  }

  const future = candidates.filter((at) => at > now);

  return future.length > 0 ? Math.min(...future) : undefined;
};

/**
 * What this run grants, given what it granted so far and where the
 * entitlement now stands. More is granted at once; less only at the next
 * launch, which starts from the stored record.
 */
export const sessionTier = (granted: Tier, current: Tier): Tier =>
  current === "free" && granted !== "free" ? granted : current;

/** Whether `current` takes away what this run still grants. */
export const isDowngradePending = (granted: Tier, current: Tier) =>
  granted !== "free" && current === "free";

/**
 * The profiles a run shows: every one with `profiles`, else the first alone,
 * the others kept on disk for a license to bring back.
 */
export const entitledProfiles = <T>(
  profiles: readonly T[],
  canHaveProfiles: boolean
): readonly T[] => (canHaveProfiles ? profiles : profiles.slice(0, 1));

/**
 * A license key as typed, trimmed, or `undefined` for one out of shape. Only
 * the obvious slip is refused here; the server decides the rest.
 */
export const normalizeLicenseKey = (input: string) => {
  const key = input.trim();

  return /^[A-Za-z0-9][A-Za-z0-9-]{7,63}$/u.test(key) ? key : undefined;
};

const hide = (text: string) => "•".repeat(text.length);

/**
 * A license key as a page may show it: its first and last blocks, each other
 * character a bullet, so the whole key never leaves main. A key with no
 * dashes shows its first and last four.
 */
export const maskLicenseKey = (key: string) => {
  const blocks = key.split("-");

  if (blocks.length < 3) {
    return key.length <= 8
      ? hide(key)
      : `${key.slice(0, 4)}${hide(key.slice(4, -4))}${key.slice(-4)}`;
  }

  return [blocks[0], ...blocks.slice(1, -1).map(hide), blocks.at(-1)].join("-");
};
