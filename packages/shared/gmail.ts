import { isValidCssColorInput } from "./color";
import {
  DEV_HIBERNATION_TIMEOUT,
  type HibernationTimeout,
  hibernationTimeouts,
} from "./hibernation";
import type { GmailLabelColors, GmailLabelTextColor } from "./schemas";

export const GMAIL_ACTION_CODE_MAP = {
  archive: 1,
  markAsRead: 3,
  delete: 9,
  markAsSpam: 7,
};

export type GmailAction = keyof typeof GMAIL_ACTION_CODE_MAP;

export const GMAIL_URL = "https://mail.google.com/mail/u/0";

export const GMAIL_INBOX_FEED_URL = `${GMAIL_URL}/feed/atom`;

// Gmail's internal ids for its system labels, which the Atom feed takes as a path segment.
export const GMAIL_FEED_LABELS = {
  primary: "^sq_ig_i_personal",
  important: "^iim",
} as const;

export function gmailFeedUrl(label?: keyof typeof GMAIL_FEED_LABELS) {
  return label ? `${GMAIL_INBOX_FEED_URL}/${GMAIL_FEED_LABELS[label]}` : GMAIL_INBOX_FEED_URL;
}

/**
 * Gmail's own name for an inbox split into category tabs, read off
 * `window.GM_INBOX_TYPE`. Categories only exist in that layout, so it is what
 * decides whether the Primary feed means anything.
 */
export const GMAIL_SECTIONED_INBOX_TYPE = "SECTIONED";

/**
 * Which feed an account reads. `inboxType` is the last one a live page
 * reported, so this answers the same way with no page to ask — `null` is an
 * account that has never had one, and reads the whole inbox.
 */
export function resolveInboxFeedUrl(
  inboxType: string | null,
  inboxCategoriesToMonitor: "primary" | "all",
) {
  return gmailFeedUrl(
    inboxType === GMAIL_SECTIONED_INBOX_TYPE && inboxCategoriesToMonitor === "primary"
      ? "primary"
      : undefined,
  );
}

// Kept under Gmail-shaped names for the settings page that reads them.
export const gmailHibernationTimeouts = hibernationTimeouts;

export type GmailHibernationTimeout = HibernationTimeout;

export const DEV_GMAIL_HIBERNATION_TIMEOUT = DEV_HIBERNATION_TIMEOUT;

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

const GMAIL_ID_KEY_REGEXP = /var GM_ID_KEY = '([a-z0-9]+)';/;

/** The per-session key Gmail's mutate endpoint requires, inlined in the page's own HTML. */
export function parseGmailIdKey(gmailDocument: string) {
  return GMAIL_ID_KEY_REGEXP.exec(gmailDocument)?.[1] ?? null;
}

/*
 * The same inline script that carries `GM_ID_KEY` is where `window.GM_INBOX_TYPE`
 * comes from, but only the key's exact `var X = '…';` shape has been seen.
 * The name, the separator and the quotes are all matched loosely so that a
 * plain assignment, a `window.` prefix and a JSON-ish key all read the same:
 * the alternative is an account silently left on the wrong feed.
 */
const GMAIL_INBOX_TYPE_REGEXP = /GM_INBOX_TYPE["']?\s*[:=]\s*["']([A-Za-z0-9_]+)["']/;

/**
 * The inbox layout, read out of Gmail's own HTML rather than off a live page,
 * which is the only way an account that has never had a view can learn it.
 */
export function parseGmailInboxType(gmailDocument: string) {
  return GMAIL_INBOX_TYPE_REGEXP.exec(gmailDocument)?.[1] ?? null;
}

/**
 * One request that archives, reads, deletes or spams a message, built here
 * because two callers send it: the Gmail preload from inside the page, and the
 * main process for an account whose Gmail is hibernated and has no page to
 * send it from. Neither side owns the shape, so neither side can drift.
 */
export function createGmailMessageActionRequest({
  messageId,
  action,
  idKey,
  actionToken,
  timestamp = Date.now(),
}: {
  messageId: string;
  action: GmailAction;
  idKey: string;
  actionToken: string;
  timestamp?: number;
}) {
  const command = "l:all";
  const labels: [] = [];
  const ids: [] = [];
  const actionCode = GMAIL_ACTION_CODE_MAP[action];

  const body = new FormData();

  body.append(
    "s_jr",
    JSON.stringify([
      null,
      [
        [null, null, null, [null, actionCode, messageId, messageId, command, [], labels, ids]],
        [null, null, null, null, null, null, [null, true, false]],
        [null, null, null, null, null, null, [null, true, false]],
      ],
      2,
      null,
      null,
      null,
      idKey,
    ]),
  );

  return {
    url: `${GMAIL_URL}/s/?v=or&ik=${idKey}&at=${actionToken}&subui=chrome&hl=en&ts=${timestamp}`,
    body,
  };
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

/**
 * A null `importantIds` is the Important feed having failed rather than having
 * come back empty, and notifies for everything: a missed notification costs
 * more than an extra one.
 */
export function filterNewMailIdsByImportance(
  newIds: readonly string[],
  newEmails: "all" | "important",
  importantIds: ReadonlySet<string> | null,
): Set<string> {
  if (newEmails === "all" || !importantIds) {
    return new Set(newIds);
  }

  return new Set(newIds.filter((id) => importantIds.has(id)));
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
