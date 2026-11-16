import { session } from "electron";

export interface DevServerPolicy {
  /** Gives a dev server's pages the policy the app's own scheme would. */
  apply: (options: { origin: string; contentSecurityPolicy: string }) => void;
}

export const createDevServerPolicy = (): DevServerPolicy => ({
  apply: ({ origin, contentSecurityPolicy }) => {
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
