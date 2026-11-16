import { serializePolicy, LOCKED_DOWN } from "./content-security-policy.ts";

/*
 * Imported only under `MERU_BUILD_MODE === "dev"`, so none of it reaches a
 * production bundle; `scripts/build.ts` fails the build if it does.
 */

export interface DevServer {
  /** Where the shell is served from, such as `http://127.0.0.1:3000/`. */
  url: string;
  /** Vite stamps it on the scripts and styles it injects. */
  nonce: string;
}

export const readDevServer = (
  env: Readonly<Record<string, string | undefined>>
): DevServer => {
  const url = env.MERU_DEV_SERVER_URL;
  const nonce = env.MERU_DEV_CSP_NONCE;

  if (!(url && nonce)) {
    throw new Error(
      "A development build needs MERU_DEV_SERVER_URL and MERU_DEV_CSP_NONCE; run it with `pnpm dev`."
    );
  }

  return { url, nonce };
};

/**
 * The dev server's origin stands in for the app's scheme, plus its hot-reload
 * socket and the nonce on what Vite injects inline, and nothing else.
 */
export const createDevContentSecurityPolicy = (devServer: DevServer) => {
  const { origin, host, protocol } = new URL(devServer.url);
  const socket = `${protocol === "https:" ? "wss:" : "ws:"}//${host}`;
  const nonce = `'nonce-${devServer.nonce}'`;

  return serializePolicy({
    ...LOCKED_DOWN,
    "script-src": [origin, nonce],
    "style-src": [origin, nonce],
    "img-src": [origin],
    "font-src": [origin],
    "connect-src": [origin, socket],
  });
};
