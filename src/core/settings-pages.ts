/** The Settings window's sections built so far, in the nav's order. */
export const SETTINGS_SECTIONS = [
  "general",
  "appearance",
  "menu-bar",
  "profiles",
  "notifications",
  "gmail",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

/** A section, or with `profileId` one profile's page inside Profiles. */
export interface SettingsPage {
  section: SettingsSection;
  profileId: string | null;
}

/** The pages the Settings window has shown, and which of them it shows. */
export interface SettingsHistory {
  pages: readonly SettingsPage[];
  at: number;
}

const FIRST_PAGE: SettingsPage = {
  section: "notifications",
  profileId: null,
};

export const FIRST_SETTINGS_HISTORY: SettingsHistory = {
  pages: [FIRST_PAGE],
  at: 0,
};

const isSamePage = (a: SettingsPage, b: SettingsPage) =>
  a.section === b.section && a.profileId === b.profileId;

export const currentSettingsPage = (history: SettingsHistory) =>
  history.pages[history.at] ?? FIRST_PAGE;

/** Shows `page` after the current one, dropping those ahead; nothing for the page shown. */
export const openSettingsPage = (
  history: SettingsHistory,
  page: SettingsPage
): SettingsHistory | undefined =>
  isSamePage(currentSettingsPage(history), page)
    ? undefined
    : {
        pages: [...history.pages.slice(0, history.at + 1), page],
        at: history.at + 1,
      };

/** One page back or forward; nothing past either end. */
export const stepSettingsPage = (
  history: SettingsHistory,
  by: -1 | 1
): SettingsHistory | undefined => {
  const at = history.at + by;

  return at < 0 || at >= history.pages.length
    ? undefined
    : { pages: history.pages, at };
};

/**
 * The history with each page of a profile no longer listed read as the
 * Profiles list it was opened from, and the same page twice in a row made
 * one; the history itself when every page's profile is listed.
 */
export const withListedProfiles = (
  history: SettingsHistory,
  listedIds: readonly string[]
): SettingsHistory => {
  const isGone = (page: SettingsPage) =>
    page.profileId !== null && !listedIds.includes(page.profileId);

  if (!history.pages.some(isGone)) {
    return history;
  }

  const pages: SettingsPage[] = [];
  let at = 0;

  for (const [index, page] of history.pages.entries()) {
    const kept = isGone(page)
      ? { section: page.section, profileId: null }
      : page;
    const last = pages.at(-1);

    if (!last || !isSamePage(last, kept)) {
      pages.push(kept);
    }

    if (index === history.at) {
      at = pages.length - 1;
    }
  }

  return { pages, at };
};
