import { isValidCssColorInput } from "./color";
import type { GmailLabelColors, GmailLabelTextColor } from "./schemas";

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
  hidePromoBanner: "--meru-hide-promo-banner",
  hideUpgradeButton: "--meru-hide-gmail-upgrade",
  moveAttachmentsToTop: "--meru-move-attachments-to-top",
  closeComposeWindowAfterSend: "--meru-close-compose-after-send",
  replyForwardInPopOut: "--meru-reply-forward-in-pop-out",
  extendDarkTheme: "--meru-extend-dark-theme",
  /**
   * Says the view is a compose window Meru opened itself, rather than a
   * setting. The preload cannot tell from the URL: Gmail redirects the
   * `?extsrc=mailto` form somewhere that is not the `/popout` a pop-out lands
   * on, and the side that opened the window is the side that knows.
   */
  composeWindow: "--meru-gmail-compose-window",
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
  unreadCount: number | null;
  unreadInbox: GmailInboxMessage[];
  outOfOffice: boolean;
  attentionRequired: boolean;
};

/**
 * Absence from the previous fetch is not enough to call an entry new: an
 * unread email moved back into the inbox, or marked unread on another device,
 * is absent from it too. `seenIds` and the `readAt` window are what separate
 * those from mail that actually arrived.
 */
export function diffInboxFeed(
  previous: { ids: ReadonlySet<string>; readAt: number } | null,
  seenIds: ReadonlySet<string>,
  entries: readonly { id: string; receivedAt: number }[],
  slack: number,
): { changed: boolean; newIds: string[] } {
  if (!previous) {
    return { changed: true, newIds: [] };
  }

  const currentIds = new Set<string>();

  const newIds: string[] = [];

  let added = false;

  for (const { id, receivedAt } of entries) {
    if (currentIds.has(id)) {
      continue;
    }

    currentIds.add(id);

    if (previous.ids.has(id)) {
      continue;
    }

    added = true;

    if (!seenIds.has(id) && receivedAt >= previous.readAt - slack) {
      newIds.push(id);
    }
  }

  return {
    changed: added || currentIds.size !== previous.ids.size,
    newIds,
  };
}

const GMAIL_MESSAGE_ID_REGEXP = /^[A-Za-z0-9]{15,}$/;

const GMAIL_QUERY_HASH_VIEWS = new Set([
  "search",
  "advanced-search",
  "label",
  "category",
  "section_query",
  "circle",
]);

export function parseGmailMessageId(hash: string) {
  const [hashPath] = hash.replace(/^#/, "").split("?");

  if (!hashPath) {
    return null;
  }

  const hashSegments = hashPath.split("/");

  const [hashView] = hashSegments;

  if (!hashView) {
    return null;
  }

  const messageIdIndex = GMAIL_QUERY_HASH_VIEWS.has(hashView) ? 2 : 1;

  if (hashSegments.length !== messageIdIndex + 1) {
    return null;
  }

  const messageId = hashSegments[messageIdIndex];

  if (!messageId || !GMAIL_MESSAGE_ID_REGEXP.test(messageId)) {
    return null;
  }

  return messageId;
}

type GmailLabelTextScope = "none" | "self" | "descendants";

function buildGmailLabelTargets(
  escapedLabel: string,
): { selector: string; textScope: GmailLabelTextScope }[] {
  return [
    { selector: `.at[title="${escapedLabel}"]`, textScope: "descendants" },
    {
      selector: `.ahR .hN[data-name="${escapedLabel}"], .ahR .hO[data-name="${escapedLabel}"]`,
      textScope: "self",
    },
    { selector: `.aim:has([data-tooltip="${escapedLabel}"]) .aEe`, textScope: "none" },
  ];
}

export function resolveGmailLabelTextColor(color: string, textColor: GmailLabelTextColor) {
  if (textColor === "white") {
    return "#ffffff";
  }

  if (textColor === "black") {
    return "#000000";
  }

  return `contrast-color(${color})`;
}

export function generateGmailLabelColorsCss(labelColors: GmailLabelColors) {
  return labelColors
    .filter(({ label, color }) => label && isValidCssColorInput(color))
    .flatMap(({ label, color, textColor }) => {
      const escapedLabel = label.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

      const resolvedTextColor = resolveGmailLabelTextColor(color, textColor);

      return buildGmailLabelTargets(escapedLabel).flatMap(({ selector, textScope }) => {
        if (textScope === "descendants") {
          return [
            `${selector} { background-color: ${color} !important; }`,
            `${selector} * { color: ${resolvedTextColor} !important; }`,
          ];
        }

        if (textScope === "self") {
          return [
            `${selector} { background-color: ${color} !important; color: ${resolvedTextColor} !important; }`,
          ];
        }

        return [`${selector} { background-color: ${color} !important; }`];
      });
    })
    .join("\n");
}
