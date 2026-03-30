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
  moveAttachmentsToTop: "--meru-move-attachments-to-top",
  closeComposeWindowAfterSend: "--meru-close-compose-after-send",
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
  sender: {
    name: string;
    email: string;
  };
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
