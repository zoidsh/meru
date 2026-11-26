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
  let opened = 0;
  let whatsNew: string | null = null;
  const listeners = new Set<() => void>();

  const announce = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const set = (next: SettingsHistory | undefined) => {
    if (next === undefined || next === history) {
      return false;
    }

    history = next;
    announce();

    return true;
  };

  return {
    current: () => currentSettingsPage(history),
    canGoBack: () => stepSettingsPage(history, -1) !== undefined,
    canGoForward: () => stepSettingsPage(history, 1) !== undefined,
    /** How many pages were opened, the one shown opened again included. */
    opened: () => opened,
    /** The release What's new opens at with the page opened last, if any. */
    whatsNew: () => whatsNew,
    /**
     * Opens the page; the one already shown opened again is told too, so
     * the window shows it again from its top. `release`, a tag, opens What's
     * new there over it.
     */
    open: (page: SettingsPage, release?: string) => {
      opened += 1;
      whatsNew = release ?? null;

      if (!set(openSettingsPage(history, page))) {
        announce();
      }
    },
    step: (by: -1 | 1) => {
      whatsNew = null;

      return set(stepSettingsPage(history, by));
    },
    /** Drops the pages of profiles no longer listed. */
    follow: (listedIds: readonly string[]) =>
      set(withListedProfiles(history, listedIds)),
    /** For a window opened afresh. */
    reset: () => {
      whatsNew = null;

      return set(FIRST_SETTINGS_HISTORY);
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type SettingsPages = ReturnType<typeof createSettingsPages>;
