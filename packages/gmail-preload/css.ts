import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";

export function initCss() {
  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hideGmailLogo)) {
    document.documentElement.classList.add("meru-hide-gmail-logo");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hideInboxFooter)) {
    document.documentElement.classList.add("meru-hide-inbox-footer");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.reverseConversation)) {
    document.documentElement.classList.add("meru-reverse-conversation");
  }

  if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.hideOutOfOfficeBanner)) {
    document.documentElement.classList.add("meru-hide-out-of-office-banner");
  }
}
