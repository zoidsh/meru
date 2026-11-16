import { once } from "node:events";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

export const STAND_IN_TITLE = "Gmail stand-in";

export const CALENDAR_TITLE = "Calendar stand-in";

export const DRIVE_TITLE = "Drive stand-in";

export const POPUP_TITLE = "Stand-in pop-up";

export const POPUP_PATH = "/popup";

/** Where the stand-in's link to another site points. */
export const ELSEWHERE_URL = "https://example.com/elsewhere";

export const STAND_IN_COOKIE = "stand-in=kept";

const page = (title: string, links: string) => `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${title}</title></head>
  <body>
    <h1>${title}</h1>
    ${links}
  </body>
</html>`;

const ELSEWHERE_LINK = `<a href="${ELSEWHERE_URL}" target="_blank">Another site</a>`;

/** A server on loopback, which can stop answering and answer again on its port. */
const listen = async (
  pages: (origins: Origins) => Record<string, string>,
  origins: () => Origins
) => {
  const requests: { path: string; cookie: string }[] = [];
  let server: Server | undefined;
  let port = 0;

  const start = async () => {
    const next = createServer((request, response) => {
      const body = pages(origins())[request.url ?? ""];

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
  calendar: string;
  drive: string;
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
  /** The same for the pop-up the Gmail stand-in opens. */
  popupCookieHeaders: string[];
  /** How many times each app's stand-in page was asked for. */
  requests: () => { gmail: number; calendar: number; drive: number };
  /** Refuses connections to the Gmail stand-in until it answers again. */
  refuse: () => Promise<void>;
  answer: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Pages served from this machine in place of Gmail, Calendar and Drive, each
 * on a port of its own so each is an origin of its own. Each sets a cookie
 * that lasts a year, so a test can tell whether a session survived a
 * restart. Gmail's links to the other two, and to a pop-up its origin opens,
 * which the e2e build treats as sign-in's would be.
 */
export const startStandIn = async (): Promise<StandIn> => {
  let origins: Origins = { calendar: "", drive: "" };
  const current = () => origins;
  const gmail = await listen(
    (links) => ({
      "/": page(
        STAND_IN_TITLE,
        `${ELSEWHERE_LINK}
    <a href="${POPUP_PATH}" target="_blank">Open a pop-up</a>
    <a href="${links.calendar}" target="_blank">Open Calendar</a>
    <a href="${links.drive}" target="_blank">Open Drive</a>`
      ),
      [POPUP_PATH]: page(POPUP_TITLE, ELSEWHERE_LINK),
    }),
    current
  );
  const calendar = await listen(
    () => ({ "/": page(CALENDAR_TITLE, "") }),
    current
  );
  const drive = await listen(() => ({ "/": page(DRIVE_TITLE, "") }), current);

  origins = { calendar: calendar.url(), drive: drive.url() };

  const headers = (path: string) =>
    gmail.requests
      .filter((request) => request.path === path)
      .map((request) => request.cookie);

  return {
    url: gmail.url(),
    calendarUrl: calendar.url(),
    driveUrl: drive.url(),
    appUrls: JSON.stringify({
      gmail: gmail.url(),
      calendar: calendar.url(),
      drive: drive.url(),
    }),
    get cookieHeaders() {
      return headers("/");
    },
    get popupCookieHeaders() {
      return headers(POPUP_PATH);
    },
    requests: () => ({
      gmail: gmail.requests.filter((request) => request.path === "/").length,
      calendar: calendar.requests.length,
      drive: drive.requests.length,
    }),
    refuse: gmail.stop,
    answer: gmail.start,
    close: async () => {
      await Promise.all([gmail.stop(), calendar.stop(), drive.stop()]);
    },
  };
};
