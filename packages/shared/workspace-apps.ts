import { msg } from "@lingui/core/macro";
import { GMAIL_URL } from "./gmail";

type WorkspaceAppDefinition = {
  label: string;
  url?: string;
  availableInLauncher?: boolean;
  singleInstance?: boolean;
};

/**
 * Ordered by label, which is the order the launcher and the settings pickers
 * list them in — Gemini Notebook sits by Gemini rather than under its own key.
 */
const workspaceAppDefinitions = {
  admin: { label: "Admin" },
  ads: { label: "Ads" },
  analytics: { label: "Analytics" },
  appsScript: { label: "Apps Script", url: "https://script.google.com" },
  calendar: { label: "Calendar" },
  chat: { label: "Chat" },
  classroom: { label: "Classroom" },
  contacts: { label: "Contacts" },
  docs: { label: "Docs" },
  drive: { label: "Drive" },
  forms: { label: "Forms" },
  gemini: { label: "Gemini" },
  notebook: { label: "Gemini Notebook" },
  gmail: { label: "Gmail", url: GMAIL_URL, availableInLauncher: false, singleInstance: true },
  groups: { label: "Groups" },
  keep: { label: "Keep" },
  meet: { label: "Meet" },
  myaccount: { label: "My Account", availableInLauncher: false },
  photos: { label: "Photos" },
  searchConsole: { label: "Search Console", url: "https://search.google.com/search-console" },
  sheets: { label: "Sheets" },
  sites: { label: "Sites" },
  slides: { label: "Slides" },
  tasks: { label: "Tasks" },
  vids: { label: "Vids" },
  voice: { label: "Voice" },
} as const satisfies Record<string, WorkspaceAppDefinition>;

export type SupportedWorkspaceApp = keyof typeof workspaceAppDefinitions;

export type LauncherWorkspaceApp = {
  [App in SupportedWorkspaceApp]: (typeof workspaceAppDefinitions)[App] extends {
    availableInLauncher: false;
  }
    ? never
    : App;
}[SupportedWorkspaceApp];

export const workspaceApps: Record<SupportedWorkspaceApp, WorkspaceAppDefinition> =
  workspaceAppDefinitions;

export const launcherWorkspaceApps = Object.fromEntries(
  Object.entries(workspaceApps)
    .filter(([, workspaceAppDefinition]) => workspaceAppDefinition.availableInLauncher !== false)
    .map(([workspaceApp, workspaceAppDefinition]) => [workspaceApp, workspaceAppDefinition.label]),
) as Record<LauncherWorkspaceApp, string>;

const LAUNCHER_EXPANDED_APPS_THRESHOLD = 3;

// lingui-set comment="Option of the Launcher display setting: how the Workspace apps launcher shows its apps in the titlebar"
export const workspaceAppsLauncherDisplays = {
  auto: msg({
    message: "Auto",
    context: "launcher display",
    comment:
      "Option of the Launcher display setting: how the Workspace apps launcher shows its apps in the titlebar; agrees with the word for display where the language genders it",
  }),
  collapsed: msg`Collapsed`,
  expanded: msg`Expanded`,
} as const;
// lingui-reset

export type WorkspaceAppsLauncherDisplay = keyof typeof workspaceAppsLauncherDisplays;

export function resolveWorkspaceAppsLauncherDisplay(
  launcherDisplay: WorkspaceAppsLauncherDisplay,
  launcherAppCount: number,
): Exclude<WorkspaceAppsLauncherDisplay, "auto"> {
  if (launcherDisplay !== "auto") {
    return launcherDisplay;
  }

  return launcherAppCount > LAUNCHER_EXPANDED_APPS_THRESHOLD ? "collapsed" : "expanded";
}

// lingui-set comment="Option of the Placement setting: where the Workspace apps launcher and the bookmarks button sit"
export const launcherAndBookmarksPlacements = {
  auto: msg({
    message: "Auto",
    context: "placement",
    comment:
      "Option of the Placement setting: where the Workspace apps launcher and the bookmarks button sit; agrees with the word for placement where the language genders it",
  }),
  sidebar: msg`Sidebar`,
  titlebar: msg`Titlebar`,
} as const;
// lingui-reset

export type LauncherAndBookmarksPlacement = keyof typeof launcherAndBookmarksPlacements;

// lingui-set comment="Option of the Workspace apps Mode setting: whether Workspace apps open as tabs in the main window or in windows of their own"
export const workspaceAppsModes = {
  tabs: msg`Tabs`,
  windows: msg`New windows`,
} as const;
// lingui-reset

export type WorkspaceAppsMode = keyof typeof workspaceAppsModes;

/**
 * Which tabs an idle sweep is allowed to unload. There is no off — `selected`
 * with no tab marked hibernates nothing.
 */
// lingui-set comment="Option of the Hibernate idle tabs setting: which Workspace app tabs are unloaded when idle"
export const workspaceAppsHibernations = {
  unpinned: msg`Unpinned tabs`,
  selected: msg`Selected tabs`,
  all: msg`All tabs`,
} as const;
// lingui-reset

export type WorkspaceAppsHibernation = keyof typeof workspaceAppsHibernations;

/** Keys double as durations for `ms`. */
// lingui-set comment="Option of the Hibernate after setting: how long a tab goes unused before it hibernates"
export const workspaceAppsHibernationTimeouts = {
  "1m": msg`1 minute`,
  "30m": msg`30 minutes`,
  "1h": msg`1 hour`,
  "3h": msg`3 hours`,
  "6h": msg`6 hours`,
} as const;
// lingui-reset

export type WorkspaceAppsHibernationTimeout = keyof typeof workspaceAppsHibernationTimeouts;

/**
 * A minute is too short to ship — a tab left alone for the length of a phone
 * call would hibernate — but it's the only way to watch an idle sweep happen
 * without waiting half an hour, so the settings UI offers it in a development
 * run and nowhere else.
 */
export const DEV_WORKSPACE_APPS_HIBERNATION_TIMEOUT: WorkspaceAppsHibernationTimeout = "1m";

/**
 * How a single Workspace App ends up being opened. Resolved per click from the
 * configured mode and the held modifier keys — never stored in the config.
 */
export type WorkspaceAppOpenBehavior = "tab" | "backgroundTab" | "newWindow";

export type WorkspaceAppBookmarkState = {
  /** Popups such as the PDF viewer are never tabs, so they offer no bookmarking. */
  savable: boolean;
  /** Whether the URL on display is among the account's bookmarks. */
  bookmarked: boolean;
};
