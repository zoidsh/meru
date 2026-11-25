import path from "node:path";

import type { Platform } from "#core/platform.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import { createSessions } from "#platform/sessions.ts";
import { createTextFile } from "#platform/text-file.ts";

import { createDoNotDisturb } from "../do-not-disturb.ts";
import { ENTITLEMENT_FILE_NAME } from "../entitlement.ts";
import { automaticProfileName } from "../profile-copy.ts";
import { createProfiles } from "../profiles.ts";
import {
  SETTINGS_FILE_NAME,
  createSettingsStore,
  followRemovedProfiles,
  saveSettings,
} from "../settings.ts";
import { createSidebar } from "../sidebar.ts";
import { STATE_FILE_NAME, saveState } from "../state-store.ts";
import { loadStores } from "../stores.ts";
import { wireEntitlement } from "./entitlement.ts";

/**
 * The stores read, the entitlement that says what this run may use of them,
 * and the profiles, the sidebar, Do Not Disturb and the settings that hold
 * them from then on.
 */
export const wireStores = async ({
  lifecycle,
  newId,
  clipboard,
}: {
  lifecycle: ReturnType<typeof createAppLifecycle>;
  newId: () => string;
  clipboard: Clipboard;
}) => {
  const platform = process.platform as Platform;
  const isMacOS = platform === "darwin";
  const sessions = createSessions();
  const stateFile = createTextFile(
    path.join(lifecycle.userDataPath, STATE_FILE_NAME)
  );
  const settingsFile = createTextFile(
    path.join(lifecycle.userDataPath, SETTINGS_FILE_NAME)
  );
  const entitlementFile = createTextFile(
    path.join(lifecycle.userDataPath, ENTITLEMENT_FILE_NAME)
  );
  const stores = await loadStores({
    stateFile,
    settingsFile,
    entitlementFile,
    newId,
    now: Date.now,
    log: console.error,
  });
  // Before the profiles and the settings, which ask it what this run may use.
  const { entitlement, licenseRequests, firstRefresh } = await wireEntitlement({
    lifecycle,
    file: entitlementFile,
    initial: stores.entitlement,
    clipboard,
  });
  const multipleProfiles = () => entitlement.can("profiles");
  const profiles = createProfiles({
    initial: stores.state,
    save: (state) => saveState(stateFile, state),
    newId,
    profileName: automaticProfileName,
    clearSession: sessions.clear,
    now: Date.now,
    log: console.error,
    multipleProfiles,
    can: entitlement.can,
  });
  // Ahead of every other listener of the profiles, so each reads the
  // sidebar as the change leaves it.
  const sidebar = createSidebar({ profiles });
  const doNotDisturb = createDoNotDisturb({
    profiles,
    now: () => new Date(),
    log: console.error,
  });

  const settings = createSettingsStore({
    initial: stores.settings,
    save: (next) => saveSettings(settingsFile, next),
    platform,
    log: console.error,
    profileValues: multipleProfiles,
    can: entitlement.can,
  });

  // The settings first, so a profile coming back reads its own values.
  entitlement.onChange(() => {
    settings.recheck();
    profiles.recheck();
  });

  followRemovedProfiles({ settings, profiles, log: console.error });

  // Not awaited: the window must not wait on a clear that hangs, and no view
  // can hold these sessions, whose profiles are no longer listed.
  profiles.finishClears();

  return {
    platform,
    isMacOS,
    sessions,
    profiles,
    sidebar,
    doNotDisturb,
    settings,
    entitlement,
    licenseRequests,
    firstRefresh,
  };
};
