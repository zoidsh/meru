import { once } from "node:events";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const STAND_IN_COOKIE = "stand-in=kept";

/** A server on loopback, which can stop answering and answer again on its port. */
export const listen = async (
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

export interface Origins {
  gmail: string;
  calendar: string;
  drive: string;
  signIn: string;
}
