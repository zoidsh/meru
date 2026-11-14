import { once } from "node:events";
import { createServer } from "node:http";

import { NONE_UNREAD } from "../app/core/fixtures/gmail-feeds.ts";

export interface GmailStub {
  /** The mailbox, as the app takes it in `MERU_GMAIL_URL`. */
  readonly url: string;
  /** The stand-in sign-in page, where the app takes a page that lands to be signed out. */
  readonly signIn: string;
  readonly stop: () => Promise<void>;
}

const MAILBOX_PATH = "/mail/u/0";

/** A loopback stand-in for Gmail: the mailbox page, which is `page`, its feed with nothing unread, and the sign-in page beside it. */
export const startGmailStub = async (page: string): Promise<GmailStub> => {
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url ?? "/", "http://stub");
    if (pathname === `${MAILBOX_PATH}/`) {
      response.writeHead(200, { "content-type": "text/html" }).end(page);
    } else if (pathname === `${MAILBOX_PATH}/feed/atom`) {
      response
        .writeHead(200, { "content-type": "application/atom+xml" })
        .end(NONE_UNREAD);
    } else if (pathname === "/signin") {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end("<!doctype html><title>Sign in</title>");
    } else {
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The Gmail stub has no port");
  }
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    signIn: `${origin}/signin`,
    stop: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
    url: `${origin}${MAILBOX_PATH}`,
  };
};
