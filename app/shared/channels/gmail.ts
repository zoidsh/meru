import { z } from "zod";

import { labelColorSchema } from "../../core/records/label-color.ts";
import {
  defineChannels,
  definePushes,
  event,
  noPayload,
  push,
  sync,
} from "./define.ts";

/** The Gmail page's style sheets the settings turn on and off, one per feature, by its setting's name under `gmail.`. */
export const gmailStylesSchema = z.object({
  hideGmailLogo: z.boolean(),
  hidePromoBanner: z.boolean(),
  hideUpgradeButton: z.boolean(),
  reverseConversation: z.boolean(),
  showTrimmedContent: z.boolean(),
});

export type GmailStyles = z.infer<typeof gmailStylesSchema>;

/** What the Gmail pane's preload applies, whole, each time it changes. */
export const gmailPageSettingsSchema = z.object({
  /** Counts up with every change, so a page can say which it applied. */
  version: z.number().int().min(0),
  /** The address of the mailbox the pane shows; the preload's features run only under it. */
  mailbox: z.string(),
  /** The address Google's sign-in starts with, where the pane lands once its session is signed out. */
  signIn: z.string(),
  styles: gmailStylesSchema,
  labelColors: z.array(labelColorSchema),
  /** The user's own style sheet, empty while there is none or Pro does not allow it. */
  userStyles: z.string(),
});

export type GmailPageSettings = z.infer<typeof gmailPageSettingsSchema>;

/** What a Gmail pane's page asks of main; the profile is the sender's, never the payload's. */
export const gmail = defineChannels("gmail", {
  /** The settings the page paints its first frame with, read once as the preload starts. */
  settings: sync(noPayload, gmailPageSettingsSchema),
  /** The page applied the settings of this version. */
  settingsAck: event(z.object({ version: z.number().int().min(0) })),
  /** The page is Google's sign-in, so the profile's session was signed out. */
  needsSignIn: event(noPayload),
  /** A selector entry found nothing where it should have, once per entry per page load. */
  selectorMiss: event(z.object({ selector: z.string().min(1).max(100) })),
});

export const gmailPushes = definePushes("gmail", {
  settingsChanged: push(gmailPageSettingsSchema),
  /** Takes the page to a place in the mailbox, such as a message, by its address's fragment. */
  navigate: push(z.object({ hash: z.string().startsWith("#").max(2000) })),
});
