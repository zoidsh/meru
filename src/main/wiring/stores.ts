import path from "node:path";

import type { Log } from "#core/log.ts";
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
  log,
}: {
  lifecycle: ReturnType<typeof createAppLifecycle>;
  newId: () => string;
  clipboard: Clipboard;
  log: Log;
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
    log,
  });
  // Before the profiles and the settings, which ask it what this run may use.
  const { entitlement, licenseRequests, firstRefresh } = await wireEntitlement({
    lifecycle,
    file: entitlementFile,
    initial: stores.entitlement,
    clipboard,
    log,
  });
  const multipleProfiles = () => entitlement.can("profiles");
  const profiles = createProfiles({
    initial: stores.state,
    save: (state) => saveState(stateFile, state),
    newId,
    profileName: automaticProfileName,
    clearSession: sessions.clear,
    now: Date.now,
    log,
    multipleProfiles,
    can: entitlement.can,
  });
  // Ahead of every other listener of the profiles, so each reads the
  // sidebar as the change leaves it.
  const sidebar = createSidebar({ profiles });
  const doNotDisturb = createDoNotDisturb({
    profiles,
    now: () => new Date(),
    log,
  });

  const settings = createSettingsStore({
    initial: stores.settings,
    save: (next) => saveSettings(settingsFile, next),
    platform,
    log,
    profileValues: multipleProfiles,
    can: entitlement.can,
  });

  // The settings first, so a profile coming back reads its own values.
  entitlement.onChange(() => {
    settings.recheck();
    profiles.recheck();
  });

  followRemovedProfiles({ settings, profiles, log });

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
    /** Where the settings are kept, for the Advanced page to open. */
    settingsFile,
    entitlement,
    licenseRequests,
    firstRefresh,
    /** Settles once every write asked of the three stores so far has landed or failed. */
    storesSettled: () =>
      Promise.allSettled([
        profiles.settled(),
        settings.settled(),
        entitlement.settled(),
      ]),
  };
};
