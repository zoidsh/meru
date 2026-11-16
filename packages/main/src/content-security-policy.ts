export interface DevServer {
  /** Where the shell is served from, such as `http://127.0.0.1:3000`. */
  url: string;
  /** Vite stamps it on the scripts and styles it injects. */
  nonce: string;
}

const serialize = (directives: Record<string, readonly string[]>) =>
  Object.entries(directives)
    .map(([name, sources]) => [name, ...sources].join(" "))
    .join("; ");

const LOCKED_DOWN = {
  "default-src": ["'none'"],
  "base-uri": ["'none'"],
  "form-action": ["'none'"],
  "frame-ancestors": ["'none'"],
  "object-src": ["'none'"],
} as const;

/**
 * The policy for the app's own pages. Built, they are served from the app's
 * scheme and load only from it. In development the dev server's origin stands
 * in for it, plus its hot-reload socket and the nonce on what Vite injects
 * inline, and nothing else.
 */
export const createContentSecurityPolicy = (devServer?: DevServer) => {
  if (!devServer) {
    return serialize({
      ...LOCKED_DOWN,
      "script-src": ["'self'"],
      "style-src": ["'self'"],
      "img-src": ["'self'"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
    });
  }

  const { origin, host, protocol } = new URL(devServer.url);
  const socket = `${protocol === "https:" ? "wss:" : "ws:"}//${host}`;
  const nonce = `'nonce-${devServer.nonce}'`;

  return serialize({
    ...LOCKED_DOWN,
    "script-src": [origin, nonce],
    "style-src": [origin, nonce],
    "img-src": [origin],
    "font-src": [origin],
    "connect-src": [origin, socket],
  });
};
