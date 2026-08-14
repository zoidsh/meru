import { GMAIL_URL } from "./gmail";

type WorkspaceAppDefinition = {
  label: string;
  url?: string;
  availableInLauncher?: boolean;
  singleInstance?: boolean;
};

const workspaceAppDefinitions = {
  calendar: { label: "Calendar" },
  chat: { label: "Chat" },
  classroom: { label: "Classroom" },
  contacts: { label: "Contacts" },
  docs: { label: "Docs" },
  drive: { label: "Drive" },
  forms: { label: "Forms" },
  gemini: { label: "Gemini" },
  gmail: { label: "Gmail", url: GMAIL_URL, availableInLauncher: false, singleInstance: true },
  groups: { label: "Groups" },
  keep: { label: "Keep" },
  meet: { label: "Meet" },
  myaccount: { label: "My Account", availableInLauncher: false },
  notebooklm: { label: "NotebookLM" },
  sheets: { label: "Sheets" },
  sites: { label: "Sites" },
  slides: { label: "Slides" },
  tasks: { label: "Tasks" },
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

export const WORKSPACE_APP_PRELOAD_ARGUMENTS = {
  docsMenuClipboard: "--meru-docs-menu-clipboard",
};

export const launcherWorkspaceApps = Object.fromEntries(
  Object.entries(workspaceApps)
    .filter(([, workspaceAppDefinition]) => workspaceAppDefinition.availableInLauncher !== false)
    .map(([workspaceApp, workspaceAppDefinition]) => [workspaceApp, workspaceAppDefinition.label]),
) as Record<LauncherWorkspaceApp, string>;

const LAUNCHER_EXPANDED_APPS_THRESHOLD = 3;

export const workspaceAppsLauncherDisplays = {
  auto: "Auto",
  collapsed: "Collapsed",
  expanded: "Expanded",
} as const;

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

export const workspaceAppsModes = {
  tabs: "Tabs",
  windows: "New Windows",
} as const;

export type WorkspaceAppsMode = keyof typeof workspaceAppsModes;

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
