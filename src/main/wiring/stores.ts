import path from "node:path";

import type { Platform } from "#core/platform.ts";
import type { createAppLifecycle } from "#platform/app.ts";
import { createSessions } from "#platform/sessions.ts";
import { createTextFile } from "#platform/text-file.ts";

import { createDoNotDisturb } from "../do-not-disturb.ts";
import { automaticProfileName } from "../profile-copy.ts";
import { createProfiles } from "../profiles.ts";
import {
  SETTINGS_FILE_NAME,
  createSettingsStore,
  saveSettings,
} from "../settings.ts";
import { createSidebar } from "../sidebar.ts";
import { STATE_FILE_NAME, saveState } from "../state-store.ts";
import { loadStores } from "../stores.ts";

/**
 * The two stores read, and the profiles, the sidebar, Do Not Disturb and the
 * settings that hold them from then on.
 */
export const wireStores = async ({
  lifecycle,
  newId,
}: {
  lifecycle: ReturnType<typeof createAppLifecycle>;
  newId: () => string;
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
  const stores = await loadStores({
    stateFile,
    settingsFile,
    newId,
    now: Date.now,
    log: console.error,
  });
  const profiles = createProfiles({
    initial: stores.state,
    save: (state) => saveState(stateFile, state),
    newId,
    profileName: automaticProfileName,
    clearSession: sessions.clear,
    now: Date.now,
    log: console.error,
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
  });

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
  };
};
