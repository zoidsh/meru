import { GMAIL_URL } from "./gmail";

type WorkspaceAppDefinition = {
  label: string;
  url?: string;
  availableInLauncher?: boolean;
  popupOnly?: boolean;
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
  myaccount: { label: "My Account", availableInLauncher: false, popupOnly: true },
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

export const launcherWorkspaceApps = Object.fromEntries(
  Object.entries(workspaceApps)
    .filter(([, workspaceAppDefinition]) => workspaceAppDefinition.availableInLauncher !== false)
    .map(([workspaceApp, workspaceAppDefinition]) => [workspaceApp, workspaceAppDefinition.label]),
) as Record<LauncherWorkspaceApp, string>;

export const workspaceAppsLauncherDisplays = {
  menu: "Menu",
  inline: "Inline",
} as const;

export type WorkspaceAppsLauncherDisplay = keyof typeof workspaceAppsLauncherDisplays;

export const workspaceAppsLauncherPositions = {
  left: "Left",
  right: "Right",
} as const;

export type WorkspaceAppsLauncherPosition = keyof typeof workspaceAppsLauncherPositions;

export const workspaceAppOpenBehaviors = {
  tab: "Tab",
  newWindow: "New Window",
  backgroundTab: "Background Tab",
} as const;

export type WorkspaceAppOpenBehavior = keyof typeof workspaceAppOpenBehaviors;
