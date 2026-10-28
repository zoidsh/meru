/*
 * The pages this machine serves to the views the app creates: one for a
 * workspace app to load, and the Gmail stand-in every account view loads.
 *
 * Those views normally load a Google property, and pointing a test at one would
 * put a live third-party site inside the assertion: a slow morning at Google
 * reads as a broken view, nothing served there is stable enough to click, and
 * which sign-in page a signed-out account view gets is Google's decision to
 * make from the user agent. Serving the pages here keeps what a view loads
 * under the test's control while leaving the view itself entirely real — it is
 * the same `WebContentsView`, in the same session, loaded through the same
 * `loadUrl`.
 *
 * Deliberately `node:http` rather than `Bun.serve`: Playwright runs the suite
 * in workers it starts under Node, where Bun's globals are not there to use.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** What the download route sends, and what the file on disk should end up holding. */
export const DOWNLOAD_BODY = "Downloaded by an end-to-end test.\n";

export const DOWNLOAD_FILE_NAME = "meru-e2e-download.txt";

/**
 * The path an account view is pointed at, shaped like Gmail's own URL so that
 * what the app appends to it — the `extsrc=mailto` query a compose window
 * carries — lands on this route too.
 */
const GMAIL_PATH = "/gmail/u/0";

/**
 * How a caller asks for a load that takes its time, as a path segment rather
 * than a query so that the app appending its own query to the URL leaves it
 * alone.
 */
const DELAY_PATH = "/delay/";

const SIGN_IN_PATH = "/signin";

/** What the page an account view ends up on is titled. */
export const SIGN_IN_PAGE_TITLE = "Sign In Stand-In";

/**
 * A page titled by whatever asked for it, so a view can be told from its
 * neighbours by title as well as by URL.
 *
 * A caller should title these differently from the workspace app's own label.
 * `WorkspaceApp.resolveTitle` falls back to that label when no page title ever
 * arrives, so a page titled "Calendar" leaves a Calendar tab reading "Calendar"
 * whether it loaded or not — and an assertion on the tab would hold either way.
 */
function renderPage(pageTitle: string) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>${pageTitle}</title></head>
<body>
<h1>${pageTitle}</h1>
<a id="download" href="/download" download>Download the file</a>
</body>
</html>
`;
}

/** The path `pageUrl` points at, and the key a request for it is recorded under. */
function pagePath(pageTitle: string) {
  return `/app/${encodeURIComponent(pageTitle)}`;
}

function respond(request: IncomingMessage, response: ServerResponse) {
  /*
   * Resolved against the request's own authority rather than a fixed host, so
   * that the redirect below can name this same server on the port it ended up
   * listening on without the handler having to be told what that port is.
   */
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  if (requestUrl.pathname.startsWith(GMAIL_PATH)) {
    /*
     * Off this origin and onto another host, which is what signed-out Gmail
     * does: it redirects the view to accounts.google.com. Two things the suite
     * reads follow from the view ending up somewhere other than where it was
     * sent — the account's attention flag, which the app sets from the URL no
     * longer starting with the Gmail one, and a page that commits in a renderer
     * process of its own, since Chromium isolates `localhost` from `127.0.0.1`
     * as two sites. `localhost` is this very server under its other name, so
     * nothing else has to be listening.
     */
    const redirect = () => {
      response.writeHead(302, {
        location: `http://localhost:${requestUrl.port}${SIGN_IN_PATH}`,
      });

      response.end();
    };

    const delay = Number.parseInt(requestUrl.pathname.split(DELAY_PATH)[1] ?? "", 10);

    if (Number.isNaN(delay)) {
      redirect();

      return;
    }

    /*
     * Guarded against the app having quit and the server having been closed
     * while the timer was pending: an exception out of a timer is an uncaught
     * exception that takes the Playwright worker with it, and the handler's own
     * guard below covers only what runs inside the handler.
     */
    setTimeout(() => {
      if (response.destroyed) {
        return;
      }

      try {
        redirect();
      } catch {
        response.destroy();
      }
    }, delay);

    return;
  }

  if (requestUrl.pathname === SIGN_IN_PATH) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });

    response.end(renderPage(SIGN_IN_PAGE_TITLE));

    return;
  }

  if (requestUrl.pathname === "/download") {
    /*
     * The attachment disposition is what makes this a download rather than a
     * navigation, which is the whole point: it reaches Chromium's download
     * pipeline, and so `will-download` and the app's own handling of it.
     */
    response.writeHead(200, {
      "content-type": "text/plain",
      "content-disposition": `attachment; filename="${DOWNLOAD_FILE_NAME}"`,
    });

    response.end(DOWNLOAD_BODY);

    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });

  response.end(renderPage(decodeURIComponent(requestUrl.pathname.replace(/^\/app\//, ""))));
}

export type TestServer = {
  /** The origin to point a saved tab at, with an ephemeral port already resolved. */
  origin: string;
  /** The URL of a page carrying the given title. */
  pageUrl(pageTitle: string): string;
  /** What `MERU_TEST_GMAIL_URL` is set to, so that account views load this server. */
  gmailUrl: string;
  /**
   * The same, holding the redirect back for `delayMs` first, for a test that
   * needs the gap between a view being attached and its page arriving. A
   * loopback page leaves no gap of its own, so the one a test reads in has to
   * be the length it asked for.
   */
  slowGmailUrl(delayMs: number): string;
  /** The page an account view is redirected to, and so the URL it comes to rest on. */
  signInUrl: string;
  /**
   * The `user-agent` a view sent when it fetched the page with this title, or
   * undefined until one has.
   *
   * Kept per page rather than as the last header seen, so a test whose view
   * never loaded reads nothing instead of whatever the test before it left —
   * which would pass an assertion against an app that fetched nothing.
   */
  userAgentFor(pageTitle: string): string | undefined;
  close(): Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const userAgents = new Map<string, string>();

  const server: Server = createServer((request, response) => {
    // Recorded off the request itself: the header a real navigation sent is the
    // only place the app's user agent can be read from outside it.
    if (request.url) {
      userAgents.set(request.url, request.headers["user-agent"] ?? "");
    }

    /*
     * Guarded, because an exception thrown out of a `node:http` handler is an
     * uncaught exception: it takes down the Playwright worker rather than
     * failing the test that caused it, and the run then reports a worker that
     * died instead of an assertion. `decodeURIComponent` is the reachable way
     * in, on a path carrying a malformed percent escape.
     */
    try {
      respond(request, response);
    } catch {
      response.writeHead(400);

      response.end();
    }
  });

  // Port 0, so concurrent runs — and several agents do work on this repository
  // at once — cannot collide on a number chosen here.
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const { port } = server.address() as AddressInfo;

  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    pageUrl(pageTitle) {
      return `${origin}${pagePath(pageTitle)}`;
    },
    userAgentFor(pageTitle) {
      return userAgents.get(pagePath(pageTitle));
    },
    gmailUrl: `${origin}${GMAIL_PATH}`,
    slowGmailUrl(delayMs) {
      return `${origin}${GMAIL_PATH}${DELAY_PATH}${delayMs}`;
    },
    signInUrl: `http://localhost:${port}${SIGN_IN_PATH}`,
    close() {
      return new Promise<void>((resolve) => {
        /*
         * Connections closed first. A view that loaded a page holds its socket
         * open on keep-alive, and `close` alone waits for it — which hangs the
         * hook rather than failing it, because the view outlives this call and
         * lets go only when the app quits.
         */
        server.closeAllConnections();

        server.close(() => resolve());
      });
    },
  };
}
