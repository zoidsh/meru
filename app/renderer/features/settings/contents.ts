import { gmailContent } from "../gmail/gmail-page.tsx";
import { profilesContent } from "../profiles/profiles-page.tsx";
import { shortcutsContent } from "../shortcuts/shortcuts-page.tsx";
import { updatesContent } from "../updater/update-status.tsx";
import type { PageContent } from "./page-content.ts";

/** Every feature's own content on a settings page. */
export const pageContents: readonly PageContent[] = [
  gmailContent,
  profilesContent,
  shortcutsContent,
  updatesContent,
];
