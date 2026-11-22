import {
  FIRST_SETTINGS_HISTORY,
  currentSettingsPage,
  openSettingsPage,
  stepSettingsPage,
  withListedProfiles,
} from "#core/settings-pages.ts";
import type { SettingsHistory, SettingsPage } from "#core/settings-pages.ts";

/**
 * The Settings window's page history, held in main so the menu's Back and
 * Forward can step it while the window has focus.
 */
export const createSettingsPages = () => {
  let history = FIRST_SETTINGS_HISTORY;
  const listeners = new Set<() => void>();

  const set = (next: SettingsHistory | undefined) => {
    if (next === undefined || next === history) {
      return false;
    }

    history = next;

    for (const listener of listeners) {
      listener();
    }

    return true;
  };

  return {
    current: () => currentSettingsPage(history),
    canGoBack: () => stepSettingsPage(history, -1) !== undefined,
    canGoForward: () => stepSettingsPage(history, 1) !== undefined,
    open: (page: SettingsPage) => set(openSettingsPage(history, page)),
    step: (by: -1 | 1) => set(stepSettingsPage(history, by)),
    /** Drops the pages of profiles no longer listed. */
    follow: (listedIds: readonly string[]) =>
      set(withListedProfiles(history, listedIds)),
    /** For a window opened afresh. */
    reset: () => set(FIRST_SETTINGS_HISTORY),
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type SettingsPages = ReturnType<typeof createSettingsPages>;
