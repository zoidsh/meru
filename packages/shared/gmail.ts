import { isValidCssColorInput } from "./color";
import type { GmailLabelColors } from "./schemas";

export const GMAIL_ACTION_CODE_MAP = {
  archive: 1,
  markAsRead: 3,
  delete: 9,
  markAsSpam: 7,
};

export const GMAIL_URL = "https://mail.google.com/mail/u/0";

export const GMAIL_INBOX_FEED_URL = `${GMAIL_URL}/feed/atom`;

export const GMAIL_DELEGATED_ACCOUNT_URL_REGEXP = new RegExp(`${GMAIL_URL}/d/([^/]+)`);

export const GMAIL_PRELOAD_ARGUMENTS = {
  hideGmailLogo: "--meru-hide-gmail-logo",
  hideInboxFooter: "--meru-hide-inbox-footer",
  reverseConversation: "--meru-reverse-conversation",
  openComposeInNewWindow: "--meru-open-compose-in-new-window",
  showSenderIcons: "--meru-show-sender-icons",
  hideOutOfOfficeBanner: "--meru-hide-out-of-office-banner",
  hideUpgradeButton: "--meru-hide-gmail-upgrade",
  moveAttachmentsToTop: "--meru-move-attachments-to-top",
  closeComposeWindowAfterSend: "--meru-close-compose-after-send",
  replyForwardInPopOut: "--meru-reply-forward-in-pop-out",
};

export function createGmailDelegatedAccountUrl(delegatedAccountId: string) {
  return `${GMAIL_URL}/d/${delegatedAccountId}`;
}

export function isGmailComposeWindowUrl(url: string) {
  return url.startsWith(GMAIL_URL) && url.includes("/popout");
}

export interface GmailInboxMessage {
  id: string;
  subject: string;
  summary: string;
  author: {
    name: string;
    email: string;
  };
  contributors: {
    name: string;
    email: string;
  }[];
  receivedAt: number;
}

export type GmailState = {
  navigationHistory: {
    canGoBack: boolean;
    canGoForward: boolean;
  };
  unreadCount: number | null;
  unreadInbox: GmailInboxMessage[];
  outOfOffice: boolean;
  attentionRequired: boolean;
};

export const GMAIL_MESSAGE_HASH_REGEXP = /#[^/]+\/([A-Za-z0-9]{15,})$/;

function buildGmailLabelSelectors(escapedLabel: string) {
  return [
    `.at[title="${escapedLabel}"]`,
    `.ahR:has([data-name="${escapedLabel}"])`,
    `.aim:has([data-tooltip="${escapedLabel}"])`,
  ];
}

export function generateGmailLabelColorsCss(labelColors: GmailLabelColors) {
  return labelColors
    .filter(({ label, color }) => label && isValidCssColorInput(color))
    .flatMap(({ label, color }) => {
      const escapedLabel = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      return buildGmailLabelSelectors(escapedLabel).flatMap((selector) => [
        `${selector} { background-color: ${color} !important; }`,
        `${selector}, ${selector} * { color: contrast-color(${color}) !important; }`,
      ]);
    })
    .join("\n");
}
