import { z } from "zod";

/** Where a link to the app opens when nothing else asks: as a tab, or in a window of its own. */
export const openBehaviorSchema = z.enum(["tab", "window"]);

export type OpenBehavior = z.infer<typeof openBehaviorSchema>;

// In the catalog's order, Gmail first and the rest by name, which a setting picking apps lists them in.
export const appIconSchema = z.enum([
  "gmail",
  "admin",
  "ads",
  "analytics",
  "appsScript",
  "calendar",
  "chat",
  "classroom",
  "contacts",
  "docs",
  "drive",
  "forms",
  "gemini",
  "notebook",
  "groups",
  "keep",
  "meet",
  "myaccount",
  "photos",
  "searchConsole",
  "sheets",
  "sites",
  "slides",
  "tasks",
  "vids",
  "voice",
]);

/** The name of one of the icons the app bundles. */
export type AppIconName = z.infer<typeof appIconSchema>;

/** An app of the catalog by its id, which is also the name of its icon. */
export const appIdSchema = appIconSchema;

export type AppId = AppIconName;

export const appSchema = z.object({
  /** A link to one of these hosts, or a subdomain of one, is a link to the app; `host/segment` claims only paths starting with that segment, for apps that share a host. */
  hosts: z.array(z.string().min(1)).min(1),
  icon: appIconSchema,
  id: appIdSchema,
  name: z.string().min(1),
  openBehavior: openBehaviorSchema,
  /** A profile keeps one tab of the app, which every link to it reuses and which cannot be closed. */
  singleInstance: z.boolean().optional(),
  url: z.url(),
});

export type App = z.infer<typeof appSchema>;

export const isSingleInstance = (app: App): boolean =>
  app.singleInstance === true;
