import type { KeyObject } from "node:crypto";

import { t } from "@lingui/core/macro";
import { Mutex, isEqual } from "es-toolkit";

import type { EntitlementState } from "#contract/entitlement.ts";
import {
  createInitialEntitlementFile,
  decodeEntitlementFile,
  storedKeyAt,
  storedLicenseKey,
  storedToken,
  withToken,
} from "#core/entitlement-file.ts";
import type { EntitlementFile } from "#core/entitlement-file.ts";
import {
  entitlementAt,
  isDowngradePending,
  maskLicenseKey,
  nextChangeAt,
  normalizeLicenseKey,
  sessionTier,
  tierCan,
} from "#core/entitlement.ts";
import type {
  Capability,
  Entitlement as Token,
  EntitlementError,
  EntitlementRecord,
} from "#core/entitlement.ts";
import type {
  EntitlementServer,
  ServerAnswer,
} from "#platform/entitlement-server.ts";
import type { TextFile } from "#platform/text-file.ts";

import { verifyToken } from "./entitlement-token.ts";
import { openStore, saveStore } from "./store-file.ts";

export const ENTITLEMENT_FILE_NAME = "entitlement.json";

const encode = (file: EntitlementFile): unknown => file;

export const saveEntitlementFile = (file: TextFile, value: EntitlementFile) =>
  saveStore({ file, encode }, value);

/** Opens the entitlement as `openStore` does. */
export const openEntitlementFile = (deps: {
  file: TextFile;
  now: () => number;
  log: (message: string) => void;
}) =>
  openStore({
    ...deps,
    name: "entitlement",
    decode: decodeEntitlementFile,
    encode,
    initial: createInitialEntitlementFile,
  });

export const REFRESH_INTERVAL = 3 * 60 * 60 * 1000;

// setTimeout fires at once for a delay past a signed 32-bit integer.
const MAX_TIMER = 2 ** 31 - 1;

export type EntitlementResult =
  | { ok: true }
  | { ok: false; error: EntitlementError; message: string };

/** What a person reads when an activation or a rename fails. */
export const entitlementErrorMessage = (error: EntitlementError) => {
  switch (error) {
    case "malformed": {
      return t`This isn't a valid license key. Check it and try again.`;
    }
    case "noLicense": {
      return t`There's no license on this computer to name it on. Enter a license key first.`;
    }
    case "invalidKey": {
      return t`There's no license with this key. Check it and try again, or contact support.`;
    }
    case "refused": {
      return t`This license key can't be used anymore. Contact support if you need help.`;
    }
    case "deviceLimit": {
      return t`This key is already in use on as many devices as it allows.`;
    }
    case "offline": {
      return t`Meru can't reach its license server. Check your connection and try again.`;
    }
    default: {
      return error satisfies never;
    }
  }
};

const failed = (error: EntitlementError): EntitlementResult => ({
  ok: false,
  error,
  message: entitlementErrorMessage(error),
});

export interface EntitlementDeps {
  initial: EntitlementFile;
  save: (file: EntitlementFile) => Promise<void>;
  server: EntitlementServer;
  /** `undefined` where the build trusts no key, so no token verifies. */
  publicKey: KeyObject | undefined;
  /** Empty where it could not be read: then no token verifies and the server is never asked. */
  deviceId: string;
  now: () => number;
  /** Where trial days are counted; the device's own zone when absent. */
  timeZone?: string;
  log: (message: string) => void;
}

/**
 * A call to the server and what its answer may replace. A refresh's answer
 * gives way to any later call's already taken, and to a key changed since it
 * was sent; an activation's or a rename's, only to a later one of those.
 */
interface Call {
  sequence: number;
  kind: "refresh" | "license";
  /** The key the call was made for; a refresh's answer is for it alone. */
  sentKey: string | undefined;
  /** The key to store with the token, for an activation. */
  storeKey?: string;
}

/**
 * The one place that says what this install may do. It reads the stored
 * token with no network, refreshes it in the background at `start` and every
 * three hours, and keeps the old one when a refresh fails, until it expires.
 */
export const createEntitlement = ({
  initial,
  save,
  server,
  publicKey,
  deviceId,
  now,
  timeZone,
  log,
}: EntitlementDeps) => {
  let file = initial;
  let disposed = false;
  const writes = new Mutex();
  const listeners = new Set<() => void>();

  // A token's signature is checked once per text, not on every read.
  let verified: { text: string; token: Token | undefined } | undefined;

  const verify = (text: string) => {
    if (verified?.text !== text) {
      verified = {
        text,
        token:
          publicKey && deviceId !== ""
            ? verifyToken(text, publicKey, deviceId)
            : undefined,
      };
    }

    return verified.token;
  };

  const record = (): EntitlementRecord => {
    const text = storedToken(file);
    const token = text === undefined ? undefined : verify(text);
    const licenseKey = storedLicenseKey(file);
    const keyStoredAt = storedKeyAt(file);

    return {
      ...(token && { token }),
      ...(licenseKey !== undefined && { licenseKey }),
      ...(keyStoredAt !== undefined && { keyStoredAt }),
    };
  };

  let granted = entitlementAt(record(), now(), timeZone).tier;

  const snapshot = (): EntitlementState => {
    const current = entitlementAt(record(), now(), timeZone);
    const licenseKey = storedLicenseKey(file);

    granted = sessionTier(granted, current.tier);

    return {
      status: current.status,
      tier: granted,
      unconfirmedReason: current.unconfirmedReason,
      trialDaysLeft: current.trialDaysLeft,
      licensee: current.licensee,
      deviceName: current.deviceLabel,
      lastConfirmed: current.lastConfirmed,
      licenseKey: licenseKey === undefined ? null : maskLicenseKey(licenseKey),
      downgradePending: isDowngradePending(granted, current.tier),
    };
  };

  let last = snapshot();
  let changeTimer: ReturnType<typeof setTimeout> | undefined;

  const scheduleChange = (onDue: () => void) => {
    clearTimeout(changeTimer);

    const at = nextChangeAt(record(), now(), timeZone);

    if (at !== undefined) {
      changeTimer = setTimeout(onDue, Math.min(at - now(), MAX_TIMER));
    }
  };

  const announce = () => {
    if (disposed) {
      return;
    }

    const next = snapshot();

    scheduleChange(announce);

    if (isEqual(next, last)) {
      return;
    }

    last = next;

    for (const listener of listeners) {
      listener();
    }
  };

  scheduleChange(announce);

  let sequences = 0;
  let appliedAny = 0;
  let appliedLicense = 0;

  const call = (
    kind: Call["kind"],
    fields: Partial<Pick<Call, "storeKey">> = {}
  ): Call => {
    sequences += 1;

    return {
      sequence: sequences,
      kind,
      sentKey: storedLicenseKey(file),
      ...fields,
    };
  };

  const isStale = ({ sequence, kind, sentKey }: Call) =>
    kind === "refresh"
      ? sequence < appliedAny || sentKey !== storedLicenseKey(file)
      : sequence < appliedLicense;

  /** Keeps `answer`'s token if it is this device's, signed and still the latest. */
  const take = async (
    answer: ServerAnswer,
    made: Call
  ): Promise<EntitlementResult> => {
    await writes.acquire();

    try {
      if (disposed) {
        return failed("offline");
      }

      if ("error" in answer) {
        return failed(answer.error);
      }

      if (!publicKey || !verifyToken(answer.token, publicKey, deviceId)) {
        log(
          "The entitlement server answered with a token that does not verify"
        );

        return failed("offline");
      }

      if (isStale(made)) {
        log("Dropped an entitlement answer that a later one replaced");

        return made.kind === "refresh" ? { ok: true } : failed("offline");
      }

      const next = withToken(file, answer.token, made.storeKey);

      await save(next);
      file = next;
      appliedAny = Math.max(appliedAny, made.sequence);

      if (made.kind === "license") {
        appliedLicense = Math.max(appliedLicense, made.sequence);
      }

      announce();

      return { ok: true };
    } finally {
      writes.release();
    }
  };

  const refresh = async () => {
    if (disposed) {
      return;
    }

    if (deviceId === "") {
      log("Did not ask for the entitlement: this device's id is unknown");

      return;
    }

    const made = call("refresh");

    try {
      const result = await take(
        await server.refresh({
          deviceId,
          ...(made.sentKey !== undefined && { licenseKey: made.sentKey }),
        }),
        made
      );

      if (!result.ok) {
        log(
          `Kept the stored entitlement: the refresh failed with ${result.error}`
        );
      }
    } catch (error) {
      log(
        `Kept the stored entitlement: the refresh failed with ${String(error)}`
      );
    } finally {
      // Time passes with or without an answer: an expiry or a day gone by
      // while asleep, or a clock moved, shows by the next refresh at most.
      announce();
    }
  };

  let refreshTimer: ReturnType<typeof setInterval> | undefined;

  return {
    can: (capability: Capability) => tierCan(granted, capability),
    snapshot: () => last,
    /** Called on each change of `snapshot`. Returns what stops it. */
    onChange: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    /** Refreshes now, then every three hours. */
    start: () => {
      clearInterval(refreshTimer);
      refreshTimer = setInterval(refresh, REFRESH_INTERVAL);

      return refresh();
    },
    /** Asks the server again now, as the dialog's retry does. */
    retry: refresh,
    /**
     * Activates `input` on this device, which the server names. The key is
     * stored only once the server agrees; a failure keeps the key and token
     * before it, so changing a key is activating another.
     */
    activate: async (input: string): Promise<EntitlementResult> => {
      const licenseKey = normalizeLicenseKey(input);

      if (licenseKey === undefined) {
        return failed("malformed");
      }

      if (deviceId === "") {
        return failed("offline");
      }

      const made = call("license", { storeKey: licenseKey });

      return take(await server.activate({ deviceId, licenseKey }), made);
    },
    /**
     * Names this device on its license as the person typed it; an empty
     * name gives it back the one the server chose.
     */
    setDeviceName: async (name: string): Promise<EntitlementResult> => {
      const licenseKey = storedLicenseKey(file);

      if (licenseKey === undefined) {
        return failed("noLicense");
      }

      if (deviceId === "") {
        return failed("offline");
      }

      const made = call("license");

      return take(
        await server.setDeviceLabel({
          deviceId,
          licenseKey,
          deviceLabel: name.trim(),
        }),
        made
      );
    },
    dispose: () => {
      disposed = true;
      clearInterval(refreshTimer);
      clearTimeout(changeTimer);
      listeners.clear();
    },
  };
};

export type Entitlement = ReturnType<typeof createEntitlement>;
