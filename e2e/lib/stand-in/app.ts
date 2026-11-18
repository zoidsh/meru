import type { IncomingMessage, ServerResponse } from "node:http";

import type { ElectronApplication } from "@playwright/test";

import {
  ACTION_KEY,
  ACTION_PATH,
  ACTION_TOKEN,
  actionAnswer,
  actionOf,
} from "./actions.ts";
import type { StandInAction } from "./actions.ts";
import {
  ACCOUNT_COOKIE,
  DEFAULT_MAIL,
  FEED_PATH,
  IMPORTANT_FEED_PATH,
  PRIMARY_FEED_PATH,
  accountOf,
  feed,
} from "./feed.ts";
import type { FeedAnswer } from "./feed.ts";
import {
  DRAFT_LABEL,
  GMAIL_MARKUP,
  GMAIL_PARTS,
  STAND_IN_TITLE,
  refreshMarkup,
} from "./gmail-page.ts";
import {
  CALENDAR_TITLE,
  DRIVE_TITLE,
  FIND_LINE,
  FIND_MOVES,
  FRAME_PATH,
  ELSEWHERE_LINK,
  ELSEWHERE_URL,
  FULL_MESSAGE_PATH,
  FULL_MESSAGE_TITLE,
  GMAIL_LINK_HASH,
  NEXT_WEEK_PATH,
  OPENER_LINE,
  POPOUT_PATH,
  POPOUT_REDIRECT_PATH,
  POPOUT_TITLE,
  POPUP_PATH,
  POPUP_TITLE,
  ROTATION_PATH,
  ROTATION_TITLE,
  SIGN_IN_PATH,
  SIGN_IN_TITLE,
  gmailWindowLinks,
  page,
} from "./pages.ts";
import { listen } from "./server.ts";
import type { Origins } from "./server.ts";

/** Signs the profile's session in to the stand-in's feed, as its own account. */
export const signIn = (
  app: ElectronApplication,
  standIn: StandIn,
  profileId: string
) =>
  app.evaluate(
    async ({ session }, { partition, url, name }) => {
      await session.fromPartition(partition).cookies.set({
        url,
        name,
        value: partition,
      });
    },
    {
      partition: `persist:${profileId}`,
      url: standIn.url,
      name: ACCOUNT_COOKIE,
    }
  );

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
  /** The `Cookie` header of each request for the rotation page, in order. */
  rotationCookieHeaders: () => string[];
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
  /** Has the feed keep each answer until the returned function sends them. */
  holdFeeds: () => () => void;
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
  let heldFeeds: (() => void)[] | undefined;
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
  const answerFeed = (
    request: IncomingMessage,
    response: ServerResponse,
    path: string
  ) => {
    const answer = feeds.get(accountOf(request) ?? "") ?? { redirect: true };

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
          : mail.filter((entry) => named?.includes(entry.id));

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

    feedLabels.push(path === FEED_PATH ? "" : path.slice(FEED_PATH.length + 1));

    if (heldFeeds) {
      heldFeeds.push(() => {
        answerFeed(request, response, path);
      });
    } else {
      answerFeed(request, response, path);
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
    <a href="${links.gmail}${GMAIL_LINK_HASH}" target="_blank">Open Gmail</a>
    ${FIND_LINE}
    ${FIND_MOVES}`
    );

    return {
      "/": body,
      [NEXT_WEEK_PATH]: body,
      [FRAME_PATH]: page("Frame", "<p>Notes</p>"),
    };
  }, current);
  const drive = await listen(() => ({ "/": page(DRIVE_TITLE, "") }), current);
  const signInServer = await listen(
    () => ({
      [POPUP_PATH]: page(POPUP_TITLE, ELSEWHERE_LINK),
      [ROTATION_PATH]: page(ROTATION_TITLE, ""),
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
    signIn: signInServer.url(),
  };

  return {
    url: gmail.url(),
    calendarUrl: calendar.url(),
    driveUrl: drive.url(),
    popupUrl: `${signInServer.url()}${POPUP_PATH.slice(1)}`,
    signInUrl: `${signInServer.url()}${SIGN_IN_PATH.slice(1)}`,
    appUrls: JSON.stringify({
      gmail: gmail.url(),
      calendar: calendar.url(),
      drive: drive.url(),
      signIn: signInServer.url(),
    }),
    get cookieHeaders() {
      return gmail.requests.map((request) => request.cookie);
    },
    rotationCookieHeaders: () =>
      signInServer.requests
        .filter((request) => request.path.startsWith(ROTATION_PATH))
        .map((request) => request.cookie),
    get popupCookieHeaders() {
      return signInServer.requests.map((request) => request.cookie);
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
    holdFeeds: () => {
      heldFeeds = [];

      return () => {
        const answers = heldFeeds ?? [];

        heldFeeds = undefined;

        for (const answer of answers) {
          answer();
        }
      };
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
        signInServer.stop(),
      ]);
    },
  };
};
