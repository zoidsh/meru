import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

export const STAND_IN_TITLE = "Gmail stand-in";

/** Where the stand-in's link to another site points. */
export const ELSEWHERE_URL = "https://example.com/elsewhere";

export const STAND_IN_COOKIE = "stand-in=kept";

const PAGE = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>${STAND_IN_TITLE}</title></head>
  <body>
    <h1>${STAND_IN_TITLE}</h1>
    <a href="${ELSEWHERE_URL}" target="_blank">Another site</a>
  </body>
</html>`;

export interface StandIn {
  /** What the app loads in place of Gmail. */
  url: string;
  /** The `Cookie` header of each request for the page, in order. */
  cookieHeaders: string[];
  close: () => Promise<void>;
}

/**
 * A page served from this machine in place of Gmail, which sets a cookie that
 * lasts a year, so a test can tell whether a session survived a restart.
 */
export const startStandIn = async (): Promise<StandIn> => {
  const cookieHeaders: string[] = [];
  const server = createServer((request, response) => {
    if (request.url !== "/") {
      response.writeHead(404).end();

      return;
    }

    cookieHeaders.push(request.headers.cookie ?? "");
    response
      .writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Set-Cookie": `${STAND_IN_COOKIE}; Max-Age=31536000; Path=/; HttpOnly`,
      })
      .end(PAGE);
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}/`,
    cookieHeaders,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
};
