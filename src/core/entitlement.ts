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

/** Meru Pro's page, where Upgrade leads, as v3's did. */
export const MERU_PRO_URL = "https://meru.so/#pricing";

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

/** Why a call about the license failed: a key out of shape, or the server's reason. */
export const ENTITLEMENT_ERRORS = [
  "malformed",
  /** A rename or a copy with no license on this computer. */
  "noLicense",
  /** This device's id could not be read, so the server cannot be asked. */
  "noDeviceId",
  /** The entitlement file could not be written, so nothing changed. */
  "notSaved",
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
  /**
   * The trial ended and the store holds no choice of the free version
   * since.
   */
  trialChoicePending: boolean;
}

/** What the entitlement store holds, as the service reads it. */
export interface EntitlementRecord {
  /** Already verified for this device; absent with none that verifies. */
  token?: Entitlement;
  licenseKey?: string;
  /** When the store first held `licenseKey` with no token for it. */
  keyStoredAt?: number;
  /** When the person chose the free version after a trial; a license or a trial clears it. */
  continuedFreeAt?: number;
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
  trialChoicePending: false,
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

  const trialEnded = () =>
    view("trialEnded", token, {
      trialChoicePending: record.continuedFreeAt === undefined,
    });

  if (token.tier === "free") {
    return token.reason === "licenseRefused"
      ? view("refused", token)
      : trialEnded();
  }

  if (
    token.tier === "trial" &&
    (token.trialEndsAt === undefined || now >= token.trialEndsAt)
  ) {
    return trialEnded();
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

/** The toasts that tell, while Meru runs, that Meru Pro ends when it quits, each worded by why. */
export const DOWNGRADE_TOASTS = [
  "pro-ends-trial-ended",
  "pro-ends-license-refused",
  "pro-ends-license-unconfirmed",
  "pro-ends-trial-unconfirmed",
  "pro-ends-date-wrong",
] as const;

export type DowngradeToast = (typeof DOWNGRADE_TOASTS)[number];

/**
 * The toast for Meru Pro ending at the next launch, while this run still has
 * it, or `undefined`. A launch starts from the stored record, so this arises
 * only while Meru runs, and a status that could not be confirmed then always
 * comes with it, since a free token never reads as unconfirmed.
 */
export const downgradeToast = ({
  status,
  unconfirmedReason,
  downgradePending,
  hasLicenseKey,
}: {
  status: EntitlementStatus;
  unconfirmedReason: UnconfirmedReason | null;
  downgradePending: boolean;
  hasLicenseKey: boolean;
}): DowngradeToast | undefined => {
  if (!downgradePending) {
    return undefined;
  }

  switch (status) {
    case "trialEnded": {
      return "pro-ends-trial-ended";
    }
    case "refused": {
      return "pro-ends-license-refused";
    }
    case "unconfirmed": {
      if (unconfirmedReason === "clock") {
        return "pro-ends-date-wrong";
      }

      return hasLicenseKey
        ? "pro-ends-license-unconfirmed"
        : "pro-ends-trial-unconfirmed";
    }
    default: {
      return undefined;
    }
  }
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

const SHOWN_AT_EACH_END = 4;

/**
 * A license key as a page may show it, so the whole key never leaves main:
 * its first block and its last, at most four characters of each, and every
 * other character but a dash a bullet. The ends show only while at least as
 * many characters stay hidden as they show, else none do.
 */
export const maskLicenseKey = (key: string) => {
  const firstDash = key.indexOf("-");
  const lastDash = key.lastIndexOf("-");
  const head = Math.min(
    SHOWN_AT_EACH_END,
    firstDash === -1 ? key.length : firstDash
  );
  const tail = Math.min(SHOWN_AT_EACH_END, key.length - lastDash - 1);
  const characters = key.replaceAll("-", "").length;
  const shows = characters - head - tail >= head + tail;

  return [...key]
    .map((character, index) =>
      character === "-" ||
      (shows && (index < head || index >= key.length - tail))
        ? character
        : "•"
    )
    .join("");
};
