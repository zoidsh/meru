import { once } from "node:events";
import { createServer } from "node:http";

import { NONE_UNREAD } from "../app/core/fixtures/gmail-feeds.ts";

/** What the stub answers the feed with: a feed's text, or the redirect to sign-in a signed-out session gets. */
export type FeedAnswer =
  | { readonly kind: "feed"; readonly text: string }
  | { readonly kind: "signIn" };

export interface FeedStub {
  /** The mailbox, as the app takes it in `MERU_GMAIL_URL`. */
  readonly url: string;
  /** Every path asked for, label included and cache-buster left out, in order. */
  readonly requests: string[];
  /** Answers the feed, or the label's feed, from now on. */
  readonly answer: (answer: FeedAnswer, label?: string) => void;
  readonly stop: () => Promise<void>;
}

const MAILBOX_PATH = "/mail/u/0";
const FEED_PATH = `${MAILBOX_PATH}/feed/atom`;

/** Where the stub sends a signed-out session, on loopback like the rest, so a request that followed the redirect would show in `requests` rather than leave the machine. */
export const SIGN_IN_PATH = "/ServiceLogin";

/** A loopback stand-in for a Gmail mailbox: its inbox feed, answering every profile's session alike, and a page for each message. */
export const startFeedStub = async (): Promise<FeedStub> => {
  const answers = new Map<string, FeedAnswer>([
    [FEED_PATH, { kind: "feed", text: NONE_UNREAD }],
  ]);
  const requests: string[] = [];
  const server = createServer((request, response) => {
    const path = decodeURIComponent(
      new URL(request.url ?? "/", "http://stub").pathname
    );
    requests.push(path);
    const found = answers.get(path);
    if (path === `${MAILBOX_PATH}/`) {
      response
        .writeHead(200, { "content-type": "text/html" })
        .end("<!doctype html><title>Gmail</title>");
    } else if (found === undefined) {
      response.writeHead(404).end();
    } else if (found.kind === "signIn") {
      response
        .writeHead(302, {
          location: `http://${request.headers.host}${SIGN_IN_PATH}?service=mail`,
        })
        .end();
    } else {
      response
        .writeHead(200, { "content-type": "application/atom+xml" })
        .end(found.text);
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("The feed stub has no port");
  }
  return {
    answer: (next, label) => {
      answers.set(
        label === undefined ? FEED_PATH : `${FEED_PATH}/${label}`,
        next
      );
    },
    requests,
    stop: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
    url: `http://127.0.0.1:${address.port}${MAILBOX_PATH}`,
  };
};
