import type { KeyObject } from "node:crypto";

import { t } from "@lingui/core/macro";
import { Mutex, isEqual } from "es-toolkit";

import type { EntitlementState } from "#contract/entitlement.ts";
import {
  createInitialEntitlementFile,
  decodeEntitlementFile,
  storedContinuedFreeAt,
  storedKeyAt,
  storedLicenseKey,
  storedToken,
  withContinuedFree,
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
import type { Clipboard } from "#platform/clipboard.ts";
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

/** What a person reads when a call about the license fails. */
export const entitlementErrorMessage = (error: EntitlementError) => {
  switch (error) {
    case "malformed": {
      return t`This isn't a valid license key. Check it and try again.`;
    }
    case "noLicense": {
      // Answered only to a call that needs a stored key, where no page offers one.
      return "";
    }
    case "noDeviceId": {
      return t`Meru couldn't identify this computer, so it can't check your license. Restart Meru and try again.`;
    }
    case "notSaved": {
      return t`Meru couldn't save your license. Check that your disk isn't full, then try again.`;
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

/** An error's name and message alone, never its stack or what it carries. */
const describeError = (error: unknown) =>
  error instanceof Error ? `${error.name}: ${error.message}` : typeof error;

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
  /** Where the license key goes when the person copies it. */
  clipboard: Clipboard;
  now: () => number;
  /** Where trial days are counted; the device's own zone when absent. */
  timeZone?: string;
  log: (message: string) => void;
}

/**
 * A call to the server, and the key its answer is for: the key it was sent
 * with, or for an activation the key it activates.
 */
interface Call {
  sequence: number;
  kind: "refresh" | "activation" | "rename";
  key: string | undefined;
}

/**
 * The one place that says what this install may do. It reads the stored
 * token with no network, refreshes it in the background at `start`, every
 * three hours and on waking from sleep, and keeps the old one when a refresh
 * fails, until it expires.
 */
export const createEntitlement = ({
  initial,
  save,
  server,
  publicKey,
  deviceId,
  clipboard,
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
    const continuedFreeAt = storedContinuedFreeAt(file);

    return {
      ...(token && { token }),
      ...(licenseKey !== undefined && { licenseKey }),
      ...(keyStoredAt !== undefined && { keyStoredAt }),
      ...(continuedFreeAt !== undefined && { continuedFreeAt }),
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
      trialChoicePending: current.trialChoicePending,
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

  /** Writes `next` and only then holds it, so a failed write changes nothing. */
  const store = async (next: EntitlementFile): Promise<boolean> => {
    try {
      await save(next);
    } catch (error) {
      log(`Could not save the entitlement: ${describeError(error)}`);

      return false;
    }

    file = next;
    announce();

    return true;
  };

  let sequences = 0;
  let appliedAny = 0;
  let appliedActivation = 0;
  const appliedForKey = new Map<string, number>();

  const call = (kind: Call["kind"], key: string | undefined): Call => {
    sequences += 1;

    return { sequence: sequences, kind, key };
  };

  /**
   * Whether an answer landing now would undo one sent later and already
   * taken. A refresh gives way to any later answer and to a key changed
   * since; a rename to a later answer for its key and a key changed since,
   * which a later activation of another key is; an activation only to a later
   * activation or a later answer for its own key.
   */
  const isStale = ({ sequence, kind, key }: Call) => {
    const laterForKey =
      key !== undefined && sequence < (appliedForKey.get(key) ?? 0);

    switch (kind) {
      case "refresh": {
        return sequence < appliedAny || key !== storedLicenseKey(file);
      }
      case "rename": {
        return key !== storedLicenseKey(file) || laterForKey;
      }
      case "activation": {
        return sequence < appliedActivation || laterForKey;
      }
      default: {
        return kind satisfies never;
      }
    }
  };

  /** The server's answer, or `offline` for a call that rejects. */
  const ask = async (request: () => Promise<ServerAnswer>) => {
    try {
      return await request();
    } catch (error) {
      log(`The entitlement server's call failed: ${describeError(error)}`);

      return { error: "offline" } as const;
    }
  };

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

      const token = publicKey
        ? verifyToken(answer.token, publicKey, deviceId)
        : undefined;

      if (!token) {
        log(
          "The entitlement server answered with a token that does not verify"
        );

        return failed("offline");
      }

      // The server agreed; a later answer already taken says where things
      // stand now, and that is what the person sees.
      if (isStale(made)) {
        log(`Dropped an entitlement ${made.kind} that a later answer replaced`);

        return { ok: true };
      }

      verified = { text: answer.token, token };

      const saved = await store(
        withToken(file, answer.token, {
          tier: token.tier,
          licenseKey: made.kind === "activation" ? made.key : undefined,
        })
      );

      if (!saved) {
        return failed("notSaved");
      }

      appliedAny = Math.max(appliedAny, made.sequence);

      if (made.kind === "activation") {
        appliedActivation = Math.max(appliedActivation, made.sequence);
      }

      if (made.key !== undefined) {
        appliedForKey.set(
          made.key,
          Math.max(appliedForKey.get(made.key) ?? 0, made.sequence)
        );
      }

      return { ok: true };
    } finally {
      writes.release();
    }
  };

  let lastAttemptAt: number | undefined;
  let refreshing = 0;
  let toldNoDeviceId = false;

  const refresh = async () => {
    if (disposed) {
      return;
    }

    if (deviceId === "") {
      // Every three hours and every wake would say it again.
      if (!toldNoDeviceId) {
        toldNoDeviceId = true;
        log("Did not ask for the entitlement: this device's id is unknown");
      }

      return;
    }

    lastAttemptAt = now();
    refreshing += 1;

    const made = call("refresh", storedLicenseKey(file));
    const result = await take(
      await ask(() =>
        server.refresh({
          deviceId,
          ...(made.key !== undefined && { licenseKey: made.key }),
        })
      ),
      made
    ).finally(() => {
      refreshing -= 1;
    });

    if (!result.ok) {
      log(
        `Kept the stored entitlement: the refresh failed with ${result.error}`
      );
    }

    // Time passes with or without an answer: an expiry or a day gone by, or
    // a clock moved, shows by the next refresh at most.
    announce();
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
     * For waking from sleep, when no timer fired: reads the state again at
     * once, and refreshes when three hours have gone by since the last try.
     */
    resume: async () => {
      if (disposed) {
        return;
      }

      announce();

      const due =
        lastAttemptAt === undefined ||
        now() - lastAttemptAt >= REFRESH_INTERVAL;

      // A refresh still out answers for this wake too.
      if (due && refreshing === 0) {
        await refresh();
      }
    },
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
        return failed("noDeviceId");
      }

      const made = call("activation", licenseKey);

      return take(
        await ask(() => server.activate({ deviceId, licenseKey })),
        made
      );
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
        return failed("noDeviceId");
      }

      const made = call("rename", licenseKey);

      return take(
        await ask(() =>
          server.setDeviceLabel({
            deviceId,
            licenseKey,
            deviceLabel: name.trim(),
          })
        ),
        made
      );
    },
    /** Puts the whole license key on the clipboard from main, so no page ever holds it. */
    copyLicenseKey: async (): Promise<EntitlementResult> => {
      const licenseKey = storedLicenseKey(file);

      if (licenseKey === undefined) {
        return failed("noLicense");
      }

      await clipboard.writeText(licenseKey);

      return { ok: true };
    },
    /**
     * Records that the person chose the free version after a trial, while
     * `trialChoicePending` holds; a later license or trial clears it.
     */
    continueFree: async (): Promise<EntitlementResult> => {
      await writes.acquire();

      try {
        const pending =
          !disposed &&
          entitlementAt(record(), now(), timeZone).trialChoicePending;

        if (pending && !(await store(withContinuedFree(file, now())))) {
          return failed("notSaved");
        }

        return { ok: true };
      } finally {
        writes.release();
      }
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
