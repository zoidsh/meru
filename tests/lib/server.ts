/*
 * A page for a workspace app view to load, served from this machine.
 *
 * A workspace app normally loads a Google property, and pointing a test at one
 * would put a live third-party site inside the assertion: a slow morning at
 * Google reads as a broken view, and nothing served there is stable enough to
 * click. Serving the page here keeps what the view loads under the test's
 * control while leaving the view itself entirely real — it is the same
 * `WebContentsView`, in the same session, loaded through the same `loadUrl`.
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

function respond(request: IncomingMessage, response: ServerResponse) {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");

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
  close(): Promise<void>;
};

export async function startTestServer(): Promise<TestServer> {
  const server: Server = createServer((request, response) => {
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
      return `${origin}/app/${encodeURIComponent(pageTitle)}`;
    },
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
