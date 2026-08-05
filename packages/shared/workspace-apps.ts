import { GMAIL_URL } from "./gmail";

type WorkspaceAppDefinition = {
  label: string;
  url?: string;
  bookmarkable?: boolean;
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
  gmail: { label: "Gmail", url: GMAIL_URL, bookmarkable: false, singleInstance: true },
  groups: { label: "Groups" },
  keep: { label: "Keep" },
  meet: { label: "Meet" },
  myaccount: { label: "My Account", bookmarkable: false, popupOnly: true },
  notebooklm: { label: "NotebookLM" },
  sheets: { label: "Sheets" },
  sites: { label: "Sites" },
  slides: { label: "Slides" },
  tasks: { label: "Tasks" },
  voice: { label: "Voice" },
} as const satisfies Record<string, WorkspaceAppDefinition>;

export type SupportedWorkspaceApp = keyof typeof workspaceAppDefinitions;

export type BookmarkableWorkspaceApp = {
  [App in SupportedWorkspaceApp]: (typeof workspaceAppDefinitions)[App] extends {
    bookmarkable: false;
  }
    ? never
    : App;
}[SupportedWorkspaceApp];

export const workspaceApps: Record<SupportedWorkspaceApp, WorkspaceAppDefinition> =
  workspaceAppDefinitions;

export const bookmarkableWorkspaceApps = Object.fromEntries(
  Object.entries(workspaceApps)
    .filter(([, workspaceAppDefinition]) => workspaceAppDefinition.bookmarkable !== false)
    .map(([workspaceApp, workspaceAppDefinition]) => [workspaceApp, workspaceAppDefinition.label]),
) as Record<BookmarkableWorkspaceApp, string>;

export const workspaceAppOpenBehaviors = {
  tab: "Tab",
  newWindow: "New Window",
  backgroundTab: "Background Tab",
} as const;

export type WorkspaceAppOpenBehavior = keyof typeof workspaceAppOpenBehaviors;

export const workspaceAppTabStripWidths = {
  auto: "Auto",
  narrow: "Narrow",
  wide: "Wide",
} as const;

export type WorkspaceAppTabStripWidth = keyof typeof workspaceAppTabStripWidths;
