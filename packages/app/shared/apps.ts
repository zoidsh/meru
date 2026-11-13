import type { App } from "../core/records/app.ts";

// Google serves an app's files from a usercontent host named after it, and a link there belongs to the app as much as one to the app's own host.
const googleHosts = (subdomain: string) => [
  `${subdomain}.google.com`,
  `${subdomain}.usercontent.google.com`,
];

const entry = (
  id: string,
  name: string,
  subdomain = id,
  more: Partial<App> = {}
): App => ({
  hosts: googleHosts(subdomain),
  icon: id,
  id,
  name,
  openBehavior: "tab",
  url: `https://${subdomain}.google.com/`,
  ...more,
});

// Docs, Sheets, Slides, Forms and Vids share docs.google.com, where only the first path segment tells them apart; their own hosts redirect there.
const onDocs = (id: string, name: string, segment: string): App => {
  const app = entry(id, name);
  return { ...app, hosts: [...app.hosts, `docs.google.com/${segment}`] };
};

/** Every Google app a tab can show, Gmail first and the rest by name. */
export const apps: readonly App[] = [
  entry("gmail", "Gmail", "mail", { singleInstance: true }),
  entry("admin", "Admin"),
  entry("ads", "Ads"),
  entry("analytics", "Analytics"),
  entry("appsScript", "Apps Script", "script"),
  entry("calendar", "Calendar"),
  entry("chat", "Chat"),
  entry("classroom", "Classroom"),
  entry("contacts", "Contacts"),
  entry("docs", "Docs"),
  entry("drive", "Drive"),
  onDocs("forms", "Forms", "forms"),
  entry("gemini", "Gemini"),
  // NotebookLM moved to notebook.google.com, and its old host still redirects there.
  entry("notebook", "Gemini Notebook", "notebook", {
    hosts: [...googleHosts("notebook"), ...googleHosts("notebooklm")],
  }),
  entry("groups", "Groups"),
  entry("keep", "Keep"),
  entry("meet", "Meet"),
  entry("myaccount", "My Account"),
  entry("photos", "Photos"),
  {
    ...entry("searchConsole", "Search Console", "search"),
    url: "https://search.google.com/search-console",
  },
  onDocs("sheets", "Sheets", "spreadsheets"),
  entry("sites", "Sites"),
  onDocs("slides", "Slides", "presentation"),
  entry("tasks", "Tasks"),
  onDocs("vids", "Vids", "videos"),
  entry("voice", "Voice"),
];

export const GMAIL_APP_ID = "gmail";

export const appById = (id: string): App | undefined =>
  apps.find((app) => app.id === id);
