import path from "node:path";
import { pathToFileURL } from "node:url";

import { resolveAppFile } from "@meru/core/app-url";
import { net, protocol } from "electron";

export interface ServeOptions {
  scheme: string;
  /** Each host is served from the directory of the same name under `root`. */
  root: string;
  hosts: readonly string[];
  contentSecurityPolicy: string;
}

export interface AppProtocol {
  /** Must run before the app is ready, as Chromium fixes schemes at startup. */
  registerPrivilegedScheme: (scheme: string) => void;
  serve: (options: ServeOptions) => void;
}

const notFound = () => new Response(null, { status: 404 });

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
      const file = resolveAppFile(request.url, scheme, hosts);

      if (!file) {
        return notFound();
      }

      try {
        const response = await net.fetch(
          pathToFileURL(path.join(root, file.host, ...file.segments)).href
        );
        const headers = new Headers(response.headers);

        headers.set("Content-Security-Policy", contentSecurityPolicy);
        headers.set("X-Content-Type-Options", "nosniff");

        return new Response(response.body, {
          status: response.status,
          headers,
        });
      } catch {
        return notFound();
      }
    });
  },
});
