import path from "node:path";
import { pathToFileURL } from "node:url";

import { net, protocol, session } from "electron";

export interface ServeOptions {
  scheme: string;
  /** Each host is served from the directory of the same name under `root`. */
  root: string;
  hosts: readonly string[];
  contentSecurityPolicy: string;
}

export interface DevServerOptions {
  origin: string;
  contentSecurityPolicy: string;
}

export interface AppProtocol {
  /** Must run before the app is ready, as Chromium fixes schemes at startup. */
  registerPrivilegedScheme: (scheme: string) => void;
  serve: (options: ServeOptions) => void;
  /** Gives a dev server's pages the policy the app's own scheme would. */
  applyToDevServer: (options: DevServerOptions) => void;
}

const notFound = () => new Response(null, { status: 404 });

/** The file a request names, or nothing when it would climb out of `root`. */
const resolveFile = (
  root: string,
  hosts: readonly string[],
  requestUrl: string
) => {
  const url = new URL(requestUrl);

  if (!hosts.includes(url.host)) {
    return;
  }

  const hostRoot = path.join(root, url.host);
  const pathname = decodeURIComponent(url.pathname);
  const filePath = path.join(
    hostRoot,
    pathname === "/" ? "index.html" : pathname
  );
  const relative = path.relative(hostRoot, filePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return;
  }

  return filePath;
};

export const createAppProtocol = (): AppProtocol => ({
  registerPrivilegedScheme: (scheme) => {
    protocol.registerSchemesAsPrivileged([
      {
        scheme,
        privileges: { standard: true, secure: true, supportFetchAPI: true },
      },
    ]);
  },
  serve: ({ scheme, root, hosts, contentSecurityPolicy }) => {
    protocol.handle(scheme, async (request) => {
      const filePath = resolveFile(root, hosts, request.url);

      if (!filePath) {
        return notFound();
      }

      try {
        const file = await net.fetch(pathToFileURL(filePath).href);
        const headers = new Headers(file.headers);

        headers.set("Content-Security-Policy", contentSecurityPolicy);
        headers.set("X-Content-Type-Options", "nosniff");

        return new Response(file.body, { status: file.status, headers });
      } catch {
        return notFound();
      }
    });
  },
  applyToDevServer: ({ origin, contentSecurityPolicy }) => {
    session.defaultSession.webRequest.onHeadersReceived(
      { urls: [`${origin}/*`] },
      (details, respond) => {
        respond({
          responseHeaders: {
            ...details.responseHeaders,
            "Content-Security-Policy": [contentSecurityPolicy],
          },
        });
      }
    );
  },
});
