import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type { Page } from "@playwright/test";

export const STAND_IN_TITLE = "Gmail stand-in";

export const CALENDAR_TITLE = "Calendar stand-in";

export const DRIVE_TITLE = "Drive stand-in";

export const POPUP_TITLE = "Stand-in pop-up";

export const POPUP_PATH = "/popup";

export const POPOUT_TITLE = "Gmail pop-out stand-in";

/** Where Gmail's pop-outs are: compose, a message, an attachment. */
export const POPOUT_PATH = "/mail/u/0/popout";

export const FULL_MESSAGE_TITLE = "Gmail full message stand-in";

/** Gmail's "View entire message" and print pages, told apart by query. */
export const FULL_MESSAGE_PATH = "/mail/u/0/";

/** A pop-out whose first load is redirected to another site. */
export const POPOUT_REDIRECT_PATH = "/mail/u/0/popout-redirect";

/** The size the stand-in's pop-out asks for, as Gmail's features string does. */
export const POPOUT_SIZE = { width: 640, height: 480 };

/** Where the Calendar stand-in's link to its next week goes. */
export const NEXT_WEEK_PATH = "/week/2";

/** Where the Calendar stand-in's link to Gmail goes, after Gmail's URL. */
export const GMAIL_LINK_HASH = "#inbox/from-calendar";

/** Where the stand-in's link to another site points. */
export const ELSEWHERE_URL = "https://example.com/elsewhere";

export const STAND_IN_COOKIE = "stand-in=kept";

/** The name of the text field on the Gmail stand-in. */
export const DRAFT_LABEL = "Draft";

/** Names of the stand-in's parts that Meru's hides take, as a person reads them. */
export const GMAIL_PARTS = {
  logo: "Gmail logo",
  promo: "Workspace offer",
  upgrade: "Upgrade",
  policy: "Programme policies",
  search: "Search mail",
  list: "Messages",
} as const;

/** One pixel, so the logo is an image without a request. */
const PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/**
 * Just the anchors Meru's hooks into Gmail look for, in Gmail's own
 * attributes and nothing of its classes or layout.
 */
const GMAIL_MARKUP = `<header>
      <div><div><a href="#inbox"><img alt="${GMAIL_PARTS.logo}" src="${PIXEL}"></a></div></div>
      <form><input aria-label="${GMAIL_PARTS.search}"></form>
      <div data-pep-id="global-pep-gmail" data-rp-onramp-container><a href="#upgrade">${GMAIL_PARTS.upgrade}</a></div>
    </header>
    <div role="main">
      REFRESH_CONTROL
      <div data-rp-onramp-container><p>${GMAIL_PARTS.promo}</p></div>
      <div gh="tl"><table aria-label="${GMAIL_PARTS.list}"><tr><td>Row</td></tr></table></div>
      <div role="contentinfo"><a href="https://www.google.com/gmail/about/policy/">${GMAIL_PARTS.policy}</a></div>
    </div>`;

/** What the stand-in's Refresh says once pressed `n` times. */
export const refreshedTimes = (n: number) => `Refreshed ${n} times`;

/**
 * Gmail's Refresh, which counts a press only as Gmail's does, by the whole
 * pointer and mouse sequence, so `click()` alone is no press. Under another
 * action code it stands for a Refresh Gmail has renamed.
 */
const refreshMarkup = (
  act: string
) => `<div gh="mtb"><div act="${act}" role="button" tabindex="0">Refresh</div></div>
      <p id="refreshed">${refreshedTimes(0)}</p>
      <script>
        (() => {
          const control = document.querySelector('[act="${act}"]');
          let seen = [];
          let presses = 0;
          for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
            control.addEventListener(type, () => seen.push(type));
          }
          control.addEventListener("mousedown", () => control.focus());
          control.addEventListener("click", () => {
            if (seen.join() === "pointerdown,mousedown,pointerup,mouseup") {
              presses += 1;
              document.getElementById("refreshed").textContent = "Refreshed " + presses + " times";
            }
            seen = [];
          });
        })();
      </script>`;

/** Names of a stand-in thread's parts, as a person reads them. */
export const THREAD_PARTS = {
  message: (n: number) => `Message ${n}`,
  text: (n: number) => `Text of message ${n}`,
  attachment: (n: number) => `attachment-${n}.pdf`,
  quoted: (n: number) => `Quoted in message ${n}`,
  showTrimmed: "Show trimmed content",
} as const;

/**
 * One open message of a thread in Gmail's markup, cut to what the thread
 * features take: its body with the quote Gmail folds behind its toggle, and
 * its attachment block below.
 */
export const threadMessage = (
  n: number
) => `<div role="listitem" aria-label="${THREAD_PARTS.message(n)}">
      <div class="Bk"><div class="G2"><div data-message-id="#msg-a:r${n}"><div class="gs"><div>
        <div class="ii gt adO"><div class="a3s"><div>
          <p>${THREAD_PARTS.text(n)}</p>
          <div class="yj6qo ajU"><div class="ajR" role="button" tabindex="0" aria-label="${THREAD_PARTS.showTrimmed}">•••</div></div>
          <div class="adL"><div class="adm"></div><div class="h5"><p>${THREAD_PARTS.quoted(n)}</p></div></div>
        </div></div></div>
        <div class="hq gt"><div class="hp"></div><span download_url="x"><a href="#download-${n}">${THREAD_PARTS.attachment(n)}</a></span></div>
      </div></div></div></div></div>
    </div>`;

/**
 * An open thread of `count` messages, oldest first, with Gmail's own rules
 * for what it folds: put in the stand-in's main region, as Gmail draws one.
 */
export const threadMarkup = (count: number) => `<style>
      .adL, .h5 { display: none; }
      .G2 { border-top: 1px solid gray; }
      [role="listitem"]:first-child .G2 { border-top: none; }
    </style>
    <h2 data-legacy-thread-id="t1">Thread</h2>
    <div role="list">${Array.from({ length: count }, (_, index) => threadMessage(index + 1)).join("")}</div>`;

/** Moves the stand-in to an open thread of `count` messages, as Gmail draws one. */
export const openThread = (view: Page, count: number) =>
  view.evaluate((markup) => {
    document.querySelector('[gh="tl"]')?.setAttribute("hidden", "");
    document
      .querySelector('[role="main"]')
      ?.insertAdjacentHTML("beforeend", markup);
    location.hash = "#inbox/t1";
  }, threadMarkup(count));

/** Names of the parts of Gmail's page the dark theme takes, as a person reads them. */
export const DARK_PARTS = {
  pane: "Conversation",
  subject: "Dark thread",
  sender: "Stand-in sender",
  body: "Text of the dark thread",
  mimic: "Mail written in Gmail's own classes",
  reply: "Reply",
  compose: "New Message",
  to: "To recipients",
  editor: "Message Body",
} as const;

/** The colour of Gmail Dark's page, which says Gmail is Dark. */
const GMAIL_DARK_PAGE = "rgb(17, 17, 17)";

/**
 * A thread in Gmail's conversation pane and a docked compose, in the classes
 * the dark theme takes and with the white Gmail Dark itself leaves on them.
 * The body holds mail written in those classes, as a sender can.
 */
const DARK_PANE = `<style>
      .iY, .AD .aaZ, td.Ap { background-color: rgb(255, 255, 255); }
      .hP, .gD, .a3I { color: rgb(31, 31, 31); }
      .ii, td.Ap { color: rgb(34, 34, 34); }
    </style>
    <div class="nH a98 iY" role="region" aria-label="${DARK_PARTS.pane}">
      <h2 class="hP" data-legacy-thread-id="t1">${DARK_PARTS.subject}</h2>
      <div role="list"><div role="listitem"><div data-message-id="#msg-a:r9">
        <span class="gD">${DARK_PARTS.sender}</span>
        <div class="gs"><div class="ii gt"><div class="a3s">
          <p>${DARK_PARTS.body}</p>
          <div class="iY"><h2 class="hP">${DARK_PARTS.mimic}</h2><span class="gD" style="color: rgb(200, 0, 0)">Red</span></div>
          <table bgcolor="#ffeecc"><tr><td>Cell</td></tr></table>
        </div></div></div>
      </div></div></div>
      <span class="ams" role="link" tabindex="0">${DARK_PARTS.reply}</span>
    </div>`;

const DARK_COMPOSE = `<div class="AD"><div role="dialog" aria-label="${DARK_PARTS.compose}">
      <div class="l m"><h2 class="a3E"><div class="a3I">${DARK_PARTS.compose}</div></h2></div>
      <div class="aaZ"><div data-compose-id="c1">
        <div class="aGb"><input class="agP" aria-label="${DARK_PARTS.to}"></div>
        <table><tr><td class="Ap"><div g_editable="true" contenteditable="true" role="textbox" aria-label="${DARK_PARTS.editor}"><p>Draft text</p><div class="aaZ">Pasted</div></div></td></tr></table>
      </div></div>
    </div></div>`;

/**
 * Moves the stand-in to an open thread with a compose docked over it, in
 * Gmail's Dark theme or its Default one.
 */
export const openDarkThread = (view: Page, dark: boolean) =>
  view.evaluate(
    ([pane, compose, page]) => {
      document.body.style.backgroundColor = page;
      document.querySelector('[gh="tl"]')?.setAttribute("hidden", "");
      document
        .querySelector('[role="main"]')
        ?.insertAdjacentHTML("beforeend", pane);
      document.body.insertAdjacentHTML("beforeend", compose);
      location.hash = "#inbox/t1";
    },
    [DARK_PANE, DARK_COMPOSE, dark ? GMAIL_DARK_PAGE : ""] as const
  );

/** Turns Gmail's theme Dark or back, then moves within the page, as Gmail would. */
export const setGmailDark = (view: Page, dark: boolean) =>
  view.evaluate(
    (page) => {
      document.body.style.backgroundColor = page;
      location.hash = `#inbox/t1/${page === "" ? "default" : "dark"}`;
    },
    dark ? GMAIL_DARK_PAGE : ""
  );

/** Where the feed sends a signed-out account, which Gmail's view can show too. */
export const SIGN_IN_PATH = "/signin";

export const SIGN_IN_TITLE = "Sign-in stand-in";

const page = (title: string, links: string) => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    <h1>${title}</h1>
    ${links}
  </body>
</html>`;

const ELSEWHERE_LINK = `<a href="${ELSEWHERE_URL}" target="_blank">Another site</a>`;

/** Says whether the page has the window that opened it, as Gmail's pop-outs need. */
const OPENER_LINE = `<p id="opener"></p>
    <script>document.getElementById("opener").textContent = window.opener ? "Has an opener" : "Has no opener";</script>`;

/** Gmail's own windows, each `window.open`ed as Gmail asks for it. */
const gmailWindowLinks = (
  signIn: string
) => `<button type="button" onclick="window.open('${POPOUT_PATH}?ver=1#cmid%253D1', 'popout', 'width=${POPOUT_SIZE.width},location=0,height=${POPOUT_SIZE.height},left=40,top=40,resizable=1,scrollbars=1')">Pop out compose</button>
    <a href="${FULL_MESSAGE_PATH}?ui=2&amp;ik=1&amp;view=lg&amp;permmsgid=msg-a:r1" target="_blank">View entire message</a>
    <a href="https://www.google.com/url?q=${encodeURIComponent(ELSEWHERE_URL)}&amp;source=gmail&amp;ust=1&amp;usg=x" target="_blank">A link in mail</a>
    <a href="${signIn}AddSession?continue=x" target="_blank">Add another account</a>
    <button type="button" onclick="window.open('about:blank')">Open a blank window</button>
    <button type="button" onclick="window.open('${POPOUT_REDIRECT_PATH}', 'redirected', 'width=${POPOUT_SIZE.width},height=${POPOUT_SIZE.height}')">Pop out elsewhere</button>`;

/** Where Meru reads the unread mail of a Gmail session. */
export const FEED_PATH = "/mail/u/0/feed/atom";

/** Where Meru reads the unread mail Gmail marks as important. */
const IMPORTANT_FEED_PATH = `${FEED_PATH}/^iim`;

/** Where Meru reads the unread mail in a tabbed inbox's Primary. */
const PRIMARY_FEED_PATH = `${FEED_PATH}/^sq_ig_i_personal`;

/** The cookie that tells the feed whose mail to answer with. */
export const ACCOUNT_COOKIE = "account";

/** Where Meru sends an action on a message. */
export const ACTION_PATH = "/mail/u/0/s/";

/** The key and token the stand-in's action endpoint hands out and asks for. */
const ACTION_KEY = "0a1b2c3d4e";
const ACTION_TOKEN = "stand-in-token";

/** An action the endpoint took, by Gmail's code, on a message id. */
export interface StandInAction {
  account: string;
  code: number;
  messageId: string;
}

/** An unread message the feed lists. */
export interface StandInMail {
  id: string;
  subject: string;
  summary: string;
  senderName: string;
  senderAddress: string;
  /** When it arrived, as the feed writes it; 17 November 2026, 09:00 UTC when not given. */
  issued?: string;
}

/**
 * What the feed answers an account with: a count and the messages it lists,
 * newest first, or sign-in. The Important feed lists those of the messages
 * whose ids `important` names, none when it names none. The Primary feed
 * lists those `primary` names, and is not found, as Gmail answers a label it
 * has no feed for, when it names none.
 */
export type FeedAnswer =
  | {
      unreadCount: number;
      mail?: StandInMail[];
      important?: string[];
      primary?: string[];
    }
  | { redirect: true };

const DEFAULT_MAIL: StandInMail[] = [
  {
    id: "1",
    subject: "Stand-in & mail",
    summary: "Nothing to read",
    senderName: "Stand-in",
    senderAddress: "stand-in@example.com",
  },
];

/** Where the stand-in's feed says a message is, by its id as Gmail's link has it. */
export const messageLink = (gmailUrl: string, id: string) =>
  `${gmailUrl}?view=conv&message_id=${id}`;

const escapeXml = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const feed = (
  unreadCount: number,
  mail: StandInMail[],
  gmailUrl: string
) => `<?xml version="1.0" encoding="UTF-8"?>
<feed version="0.3" xmlns="http://purl.org/atom/ns#">
<title>Gmail - Inbox for stand-in@example.com</title>
<fullcount>${unreadCount}</fullcount>
${mail
  .map(
    (message) => `<entry>
<title>${escapeXml(message.subject)}</title>
<summary>${escapeXml(message.summary)}</summary>
<link rel="alternate" href="${escapeXml(messageLink(gmailUrl, message.id))}" type="text/html" />
<issued>${message.issued ?? "2026-11-17T09:00:00Z"}</issued>
<author><name>${escapeXml(message.senderName)}</name><email>${escapeXml(message.senderAddress)}</email></author>
</entry>`
  )
  .join("\n")}
</feed>`;

const accountOf = (request: IncomingMessage) =>
  (request.headers.cookie ?? "")
    .split("; ")
    .find((cookie) => cookie.startsWith(`${ACCOUNT_COOKIE}=`))
    ?.slice(ACCOUNT_COOKIE.length + 1);

/** One chunk as Gmail frames it, carrying the key and the first request's error. */
const actionAnswer = (error: unknown) => {
  const json = JSON.stringify([null, [[null, error]], 2, 0, ACTION_KEY]);

  return `)]}'\n${json.length}&${json}`;
};

/** The code and message id of the action an `s_jr` body asks for, if any. */
const actionOf = (body: string) => {
  let sjr: unknown = null;

  try {
    sjr = JSON.parse(new URLSearchParams(body).get("s_jr") ?? "");
  } catch {
    // Not an action, like the key request's body.
  }

  const call = Array.isArray(sjr)
    ? ((sjr as unknown[][][][])[1]?.[0]?.[3] as unknown[] | undefined)
    : undefined;
  const [, code, messageId] = call ?? [];

  return typeof code === "number" && typeof messageId === "string"
    ? { code, messageId }
    : undefined;
};

/** A server on loopback, which can stop answering and answer again on its port. */
const listen = async (
  pages: (origins: Origins) => Record<string, string>,
  origins: () => Origins,
  /** Answers a request itself, outside `requests`, when it returns true. */
  answers?: (request: IncomingMessage, response: ServerResponse) => boolean
) => {
  const requests: { path: string; cookie: string }[] = [];
  let server: Server | undefined;
  let port = 0;

  const start = async () => {
    const next = createServer((request, response) => {
      if (answers?.(request, response)) {
        return;
      }

      // A query, as a message's link has, is the page without it.
      const body = pages(origins())[request.url?.split("?", 1)[0] ?? ""];

      if (body === undefined) {
        response.writeHead(404).end();

        return;
      }

      requests.push({
        path: request.url ?? "",
        cookie: request.headers.cookie ?? "",
      });
      response
        .writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Set-Cookie": `${STAND_IN_COOKIE}; Max-Age=31536000; Path=/; HttpOnly`,
        })
        .end(body);
    });

    next.listen(port, "127.0.0.1");
    await once(next, "listening");
    ({ port } = next.address() as AddressInfo);
    server = next;
  };

  const stop = async () => {
    const current = server;

    server = undefined;

    if (current) {
      current.closeAllConnections();
      current.close();
      await once(current, "close");
    }
  };

  await start();

  return {
    url: () => `http://127.0.0.1:${port}/`,
    requests,
    start,
    stop,
  };
};

interface Origins {
  gmail: string;
  calendar: string;
  drive: string;
  signIn: string;
}

export interface StandIn {
  /** What the app loads in place of Gmail. */
  url: string;
  calendarUrl: string;
  driveUrl: string;
  /** What the app is given as `MERU_TEST_APP_URLS`. */
  appUrls: string;
  /** The `Cookie` header of each request for the Gmail stand-in, in order. */
  cookieHeaders: string[];
  /** The same for the sign-in pop-up the Gmail stand-in opens. */
  popupCookieHeaders: string[];
  /** Where that pop-up is. */
  popupUrl: string;
  /** The sign-in stand-in's page, on an origin of its own. */
  signInUrl: string;
  /**
   * Has the Gmail stand-in's feed answer the session whose `account` cookie
   * is `account` this way, and `""` every session with no such cookie; one
   * it has not been told of is sent to sign-in.
   */
  setFeed: (account: string, answer: FeedAnswer) => void;
  /** How many times each app's stand-in page was asked for. */
  requests: () => { gmail: number; calendar: number; drive: number };
  /**
   * Has the action endpoint, once it takes an action for `account`, answer
   * that account's feed this way, as Gmail's would after it.
   */
  setFeedAfterAction: (account: string, answer: FeedAnswer) => void;
  /**
   * Has the Gmail stand-in's page, from its next load, answer
   * `GM_INBOX_TYPE` with what this expression evaluates to as it is read,
   * which can throw; none, as at first, leaves it unset.
   */
  setInboxType: (expression: string | undefined) => void;
  /**
   * Has the Gmail stand-in's page, from its next load, have its Refresh
   * under another action code, which still counts its presses.
   */
  renameRefresh: () => void;
  /** The label of each feed asked for, in order, `""` for the whole inbox. */
  feedLabels: string[];
  /** Every action the endpoint took, in order. */
  actions: StandInAction[];
  /** Every action the endpoint refused, in order, as it was asked. */
  refusedActions: StandInAction[];
  /** Has the action endpoint refuse every action for `account`, as Gmail's error 10. */
  failActions: (account: string) => void;
  /**
   * Has the action endpoint keep each answer, a refusal included, until the
   * returned function sends them.
   */
  holdActions: () => () => void;
  /** Refuses connections to the Gmail stand-in until it answers again. */
  refuse: () => Promise<void>;
  answer: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Pages served from this machine in place of Gmail, Calendar, Drive and
 * sign-in, each on a port of its own so each is an origin of its own. Each
 * sets a cookie that lasts a year, which a cookie's indifference to the port
 * sends to all four, so a test can tell whether a session survived a restart
 * or reached a pop-up. Gmail links to the other apps and to the sign-in
 * pop-up, which the e2e build treats as sign-in's; Calendar to its next week
 * and back to Gmail.
 */
export const startStandIn = async (): Promise<StandIn> => {
  let origins: Origins = { gmail: "", calendar: "", drive: "", signIn: "" };
  const current = () => origins;
  const feeds = new Map<string, FeedAnswer>();
  const feedsAfterAction = new Map<string, FeedAnswer>();
  const actions: StandInAction[] = [];
  const refusedActions: StandInAction[] = [];
  const failing = new Set<string>();
  const feedLabels: string[] = [];
  let inboxType: string | undefined;
  let refreshAct = "20";
  let held: (() => void)[] | undefined;
  const send = (answer: () => void) => {
    if (held) {
      held.push(answer);
    } else {
      answer();
    }
  };
  /**
   * Gmail's private action endpoint: a request without the key and token is
   * refused with both, one with them takes its action.
   */
  const answerAction = (request: IncomingMessage, response: ServerResponse) => {
    const chunks: Buffer[] = [];

    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.on("end", () => {
      const query = new URL(request.url ?? "", origins.gmail).searchParams;
      const account = accountOf(request) ?? "";
      const action = actionOf(Buffer.concat(chunks).toString("utf-8"));
      const headers = { "Content-Type": "text/javascript; charset=UTF-8" };

      if (query.get("ik") !== ACTION_KEY || query.get("at") !== ACTION_TOKEN) {
        response
          .writeHead(200, {
            ...headers,
            "Set-Cookie": `GMAIL_AT=${ACTION_TOKEN}; Path=${ACTION_PATH}`,
          })
          .end(actionAnswer([null, "Invalid request ID key", 12]));

        return;
      }

      if (action && failing.has(account)) {
        refusedActions.push({ account, ...action });
        send(() => {
          response
            .writeHead(200, headers)
            .end(actionAnswer([null, "Refused", 10]));
        });

        return;
      }

      if (action) {
        actions.push({ account, ...action });

        const after = feedsAfterAction.get(account);

        if (after) {
          feeds.set(account, after);
        }
      }

      send(() => {
        response.writeHead(200, headers).end(actionAnswer(null));
      });
    });
  };
  const answerMail = (request: IncomingMessage, response: ServerResponse) => {
    if (request.url === POPOUT_REDIRECT_PATH) {
      response.writeHead(302, { Location: ELSEWHERE_URL }).end();

      return true;
    }

    if (
      request.method === "POST" &&
      request.url?.startsWith(`${ACTION_PATH}?`)
    ) {
      answerAction(request, response);

      return true;
    }

    const path = decodeURIComponent(request.url ?? "");

    if (
      path !== FEED_PATH &&
      path !== IMPORTANT_FEED_PATH &&
      path !== PRIMARY_FEED_PATH
    ) {
      return false;
    }

    const answer = feeds.get(accountOf(request) ?? "") ?? { redirect: true };

    feedLabels.push(path === FEED_PATH ? "" : path.slice(FEED_PATH.length + 1));

    if ("redirect" in answer) {
      response.writeHead(302, { Location: `${origins.signIn}signin` }).end();
    } else if (path === PRIMARY_FEED_PATH && answer.primary === undefined) {
      response.writeHead(404, { "Content-Type": "text/html" }).end();
    } else {
      const mail = answer.mail ?? DEFAULT_MAIL;
      const named =
        path === PRIMARY_FEED_PATH ? answer.primary : answer.important;
      const listed =
        path === FEED_PATH
          ? mail
          : mail.filter((message) => named?.includes(message.id));

      response
        .writeHead(200, {
          "Content-Type": "application/atom+xml; charset=utf-8",
        })
        .end(
          feed(
            path === FEED_PATH ? answer.unreadCount : listed.length,
            listed,
            origins.gmail
          )
        );
    }

    return true;
  };
  const gmail = await listen(
    (links) => ({
      "/": page(
        STAND_IN_TITLE,
        `${ELSEWHERE_LINK}
    <a href="${links.signIn}${POPUP_PATH.slice(1)}" target="_blank">Open a pop-up</a>
    ${gmailWindowLinks(links.signIn)}
    <a href="${links.calendar}" target="_blank">Open Calendar</a>
    <a href="${links.drive}" target="_blank">Open Drive</a>
    <textarea aria-label="${DRAFT_LABEL}"></textarea>
    ${GMAIL_MARKUP.replace("REFRESH_CONTROL", refreshMarkup(refreshAct))}
    ${inboxType === undefined ? "" : `<script>Object.defineProperty(window, "GM_INBOX_TYPE", { get: () => (${inboxType}) });</script>`}`
      ),
      [POPOUT_PATH]: page(
        POPOUT_TITLE,
        `${OPENER_LINE}
    <button type="button" onclick="window.close()">Send</button>
    <a href="${ELSEWHERE_URL}">Leave for another site</a>`
      ),
      [FULL_MESSAGE_PATH]: page(FULL_MESSAGE_TITLE, OPENER_LINE),
    }),
    current,
    answerMail
  );
  const calendar = await listen((links) => {
    const body = page(
      CALENDAR_TITLE,
      `<a href="${NEXT_WEEK_PATH}">Next week</a>
    <a href="${links.gmail}${GMAIL_LINK_HASH}" target="_blank">Open Gmail</a>`
    );

    return { "/": body, [NEXT_WEEK_PATH]: body };
  }, current);
  const drive = await listen(() => ({ "/": page(DRIVE_TITLE, "") }), current);
  const signIn = await listen(
    () => ({
      [POPUP_PATH]: page(POPUP_TITLE, ELSEWHERE_LINK),
      // An Upgrade button no Gmail hide may reach off Gmail's origin.
      [SIGN_IN_PATH]: page(
        SIGN_IN_TITLE,
        `<div data-pep-id="global-pep-gmail"><a href="#upgrade">${GMAIL_PARTS.upgrade}</a></div>`
      ),
    }),
    current
  );

  origins = {
    gmail: gmail.url(),
    calendar: calendar.url(),
    drive: drive.url(),
    signIn: signIn.url(),
  };

  return {
    url: gmail.url(),
    calendarUrl: calendar.url(),
    driveUrl: drive.url(),
    popupUrl: `${signIn.url()}${POPUP_PATH.slice(1)}`,
    signInUrl: `${signIn.url()}${SIGN_IN_PATH.slice(1)}`,
    appUrls: JSON.stringify({
      gmail: gmail.url(),
      calendar: calendar.url(),
      drive: drive.url(),
      signIn: signIn.url(),
    }),
    get cookieHeaders() {
      return gmail.requests.map((request) => request.cookie);
    },
    get popupCookieHeaders() {
      return signIn.requests.map((request) => request.cookie);
    },
    setFeed: (account, answer) => {
      feeds.set(account, answer);
    },
    setFeedAfterAction: (account, answer) => {
      feedsAfterAction.set(account, answer);
    },
    setInboxType: (expression) => {
      inboxType = expression;
    },
    renameRefresh: () => {
      refreshAct = "19";
    },
    feedLabels,
    actions,
    refusedActions,
    failActions: (account) => {
      failing.add(account);
    },
    holdActions: () => {
      held = [];

      return () => {
        const answers = held ?? [];

        held = undefined;

        for (const answer of answers) {
          answer();
        }
      };
    },
    requests: () => ({
      gmail: gmail.requests.length,
      calendar: calendar.requests.length,
      drive: drive.requests.length,
    }),
    refuse: gmail.stop,
    answer: gmail.start,
    close: async () => {
      await Promise.all([
        gmail.stop(),
        calendar.stop(),
        drive.stop(),
        signIn.stop(),
      ]);
    },
  };
};
