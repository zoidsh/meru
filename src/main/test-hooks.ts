// Only the suite's build calls these, behind `MERU_E2E_BUILD`, and a release
// build fails if any global's name here is in its output.

import type { SentNotice } from "#contract/gmail-channels.ts";
import type { GmailHealth } from "#contract/gmail.ts";
import type { SoundRequest } from "#contract/shell-sound.ts";
import {
  storedLicenseKey,
  storedToken,
  withToken,
} from "#core/entitlement-file.ts";
import type { EntitlementFile } from "#core/entitlement-file.ts";
import { DAY } from "#core/entitlement.ts";
import type {
  OverridableSettingKey,
  SettingKey,
  SettingValue,
} from "#core/settings.ts";
import type { TabKey } from "#core/tabs.ts";
import type { EntitlementServer } from "#platform/entitlement-server.ts";

import { signDevToken } from "./entitlement-stub.ts";
import type { Entitlement } from "./entitlement.ts";
import type { SettingsStore } from "./settings.ts";

/**
 * What Gmail's pages reported and what was refused, in order, on the main
 * process's global under `meruTestGmailPage`.
 */
export const captureGmailPage = () => {
  const captured = {
    health: [] as (TabKey & GmailHealth)[],
    refused: [] as (string | undefined)[],
    sent: [] as { webContentsId: number; notice: SentNotice }[],
  };

  Reflect.set(globalThis, "meruTestGmailPage", captured);

  return {
    onHealth: (key: TabKey, health: GmailHealth) => {
      captured.health.push({ ...key, ...health });
    },
    onRefused: (origin: string | undefined) => {
      captured.refused.push(origin);
    },
    onSent: (webContentsId: number, notice: SentNotice) => {
      captured.sent.push({ webContentsId, notice });
    },
  };
};

/**
 * Each sound asked for, in order, on the main process's global under
 * `meruTestSounds`, in place of playing it: the suite never makes a sound.
 */
export const captureSounds = () => {
  const captured: SoundRequest[] = [];

  Reflect.set(globalThis, "meruTestSounds", captured);

  return (request: SoundRequest) => {
    captured.push(request);
  };
};

/**
 * `file` with a trial of this device's when `MERU_TEST_ENTITLEMENT` is
 * `trial` and it holds no token or key, so a launch is a trial from its first
 * frame, as an installed trial's is, rather than free until the stand-in's
 * first answer.
 */
export const seedTestEntitlement = (
  file: EntitlementFile,
  deviceId: string,
  now: number
): EntitlementFile => {
  if (
    process.env.MERU_TEST_ENTITLEMENT !== "trial" ||
    deviceId === "" ||
    storedToken(file) !== undefined ||
    storedLicenseKey(file) !== undefined
  ) {
    return file;
  }

  const ends = now + 14 * DAY;
  const token = signDevToken({
    v: 1,
    tier: "trial",
    deviceId,
    issuedAt: now,
    expiresAt: ends,
    trialEndsAt: ends,
  });

  return withToken(file, token, { tier: "trial" });
};

/** What the entitlement answers, on the main process's global under `meruTestEntitlement`. */
export const exposeTestEntitlement = (entitlement: Entitlement) => {
  Reflect.set(globalThis, "meruTestEntitlement", {
    snapshot: entitlement.snapshot,
    can: entitlement.can,
    activate: entitlement.activate,
  });
};

/**
 * `server` with each call held from `hold` until `release`, so a test sees a
 * request that is still out.
 */
export const holdEntitlementServer = (server: EntitlementServer) => {
  let held: PromiseWithResolvers<void> | undefined;

  const after =
    <Request, Answer>(call: (request: Request) => Promise<Answer>) =>
    async (request: Request) => {
      await held?.promise;

      return call(request);
    };

  return {
    server: {
      refresh: after(server.refresh),
      activate: after(server.activate),
      setDeviceLabel: after(server.setDeviceLabel),
    } satisfies EntitlementServer,
    hold: () => {
      held ??= Promise.withResolvers();
    },
    release: () => {
      held?.resolve();
      held = undefined;
    },
  };
};

/**
 * Sets a setting, or a profile's own value of one, as a settings page would,
 * under `meruTestSettings`.
 */
export const exposeTestSettings = (settings: SettingsStore) => {
  Reflect.set(globalThis, "meruTestSettings", {
    set: <Key extends SettingKey>(key: Key, value: SettingValue<Key>) =>
      settings.update(key, () => value),
    setOverride: <Key extends OverridableSettingKey>(
      profileId: string,
      key: Key,
      value: SettingValue<Key>
    ) => settings.setOverride(profileId, key, value),
    clearOverride: (profileId: string, key: OverridableSettingKey) =>
      settings.clearOverride(profileId, key),
  });
};
