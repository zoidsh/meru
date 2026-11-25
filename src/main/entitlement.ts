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
  nextChangeAt,
  normalizeLicenseKey,
  sessionTier,
  tierCan,
} from "#core/entitlement.ts";
import type {
  Capability,
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
  /** Where trial days are counted; the device's own zone when absent. */
  timeZone?: string;
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

export interface EntitlementDeps {
  initial: EntitlementFile;
  save: (file: EntitlementFile) => Promise<void>;
  server: EntitlementServer;
  /** `undefined` where the build trusts no key, so no token verifies. */
  publicKey: KeyObject | undefined;
  deviceId: string;
  /** Sent as the device's label when a key is activated. */
  defaultDeviceName: () => string;
  now: () => number;
  /** Where trial days are counted; the device's own zone when absent. */
  timeZone?: string;
  log: (message: string) => void;
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
  defaultDeviceName,
  now,
  timeZone,
  log,
}: EntitlementDeps) => {
  let file = initial;
  const writes = new Mutex();
  const listeners = new Set<() => void>();

  const record = (): EntitlementRecord => {
    const text = storedToken(file);
    const token =
      text !== undefined && publicKey
        ? verifyToken(text, publicKey, deviceId)
        : undefined;

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

    granted = sessionTier(granted, current.tier);

    return {
      status: current.status,
      tier: granted,
      unconfirmedReason: current.unconfirmedReason,
      trialDaysLeft: current.trialDaysLeft,
      licensee: current.licensee,
      deviceName: current.deviceLabel,
      lastConfirmed: current.lastConfirmed,
      hasLicenseKey: storedLicenseKey(file) !== undefined,
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

  /** Keeps `answer`'s token if it is this device's and signed, for `licenseKey` if given. */
  const take = async (
    answer: ServerAnswer,
    licenseKey?: string
  ): Promise<EntitlementResult> => {
    await writes.acquire();

    try {
      if ("error" in answer) {
        return {
          ok: false,
          error: answer.error,
          message: entitlementErrorMessage(answer.error),
        };
      }

      if (!publicKey || !verifyToken(answer.token, publicKey, deviceId)) {
        log(
          "The entitlement server answered with a token that does not verify"
        );

        return {
          ok: false,
          error: "offline",
          message: entitlementErrorMessage("offline"),
        };
      }

      const next = withToken(file, answer.token, licenseKey);

      await save(next);
      file = next;
      announce();

      return { ok: true };
    } finally {
      writes.release();
    }
  };

  const refresh = async () => {
    const licenseKey = storedLicenseKey(file);

    try {
      const result = await take(
        await server.refresh({
          deviceId,
          ...(licenseKey !== undefined && { licenseKey }),
        })
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
     * Activates `input` on this device, under its name. The key is stored
     * only once the server agrees; a failure keeps the key and token before
     * it, so changing a key is activating another.
     */
    activate: async (input: string): Promise<EntitlementResult> => {
      const licenseKey = normalizeLicenseKey(input);

      if (licenseKey === undefined) {
        return {
          ok: false,
          error: "malformed",
          message: entitlementErrorMessage("malformed"),
        };
      }

      return take(
        await server.activate({
          deviceId,
          licenseKey,
          deviceLabel: defaultDeviceName(),
        }),
        licenseKey
      );
    },
    /** Renames this device on its license. */
    setDeviceName: async (name: string): Promise<EntitlementResult> => {
      const licenseKey = storedLicenseKey(file);
      const deviceLabel = name.trim();

      if (licenseKey === undefined || deviceLabel === "") {
        return {
          ok: false,
          error: "refused",
          message: entitlementErrorMessage("refused"),
        };
      }

      return take(
        await server.setDeviceLabel({ deviceId, licenseKey, deviceLabel })
      );
    },
    dispose: () => {
      clearInterval(refreshTimer);
      clearTimeout(changeTimer);
      listeners.clear();
    },
  };
};

export type Entitlement = ReturnType<typeof createEntitlement>;
