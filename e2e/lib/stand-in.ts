import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const STAND_IN_TITLE = "Gmail stand-in";

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

const PAGES: Record<string, string> = {
  "/": page(
    STAND_IN_TITLE,
    `${ELSEWHERE_LINK}
    <a href="${POPUP_PATH}" target="_blank">Open a pop-up</a>`
  ),
  [POPUP_PATH]: page(POPUP_TITLE, ELSEWHERE_LINK),
};

export interface StandIn {
  /** What the app loads in place of Gmail. */
  url: string;
  /** The `Cookie` header of each request for the stand-in page, in order. */
  cookieHeaders: string[];
  /** The same for the pop-up the stand-in opens. */
  popupCookieHeaders: string[];
  close: () => Promise<void>;
}

/**
 * A page served from this machine in place of Gmail, which sets a cookie that
 * lasts a year, so a test can tell whether a session survived a restart, and
 * a pop-up it opens, which the e2e build treats as sign-in's would be.
 */
export const startStandIn = async (): Promise<StandIn> => {
  const cookieHeaders: string[] = [];
  const popupCookieHeaders: string[] = [];
  const server = createServer((request, response) => {
    const body = PAGES[request.url ?? ""];

    if (body === undefined) {
      response.writeHead(404).end();

      return;
    }

    (request.url === POPUP_PATH ? popupCookieHeaders : cookieHeaders).push(
      request.headers.cookie ?? ""
    );
    response
      .writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `${STAND_IN_COOKIE}; Max-Age=31536000; Path=/; HttpOnly`,
      })
      .end(body);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/`,
    cookieHeaders,
    popupCookieHeaders,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
};
