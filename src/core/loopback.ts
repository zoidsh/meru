/** What a refused request is logged under, which the suite looks for. */
export const REFUSED_MARKER = "MERU_E2E_REFUSED";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

/**
 * Whether `url` stays on this machine: a loopback address, or a scheme that
 * reaches no network, as the app's own, `data:`, `blob:` and `devtools:`.
 */
export const staysOnMachine = (url: string) => {
  try {
    const { protocol, hostname } = new URL(url);

    return !/^(?:https?|wss?|ftp):$/u.test(protocol) || LOOPBACK.has(hostname);
  } catch {
    return false;
  }
};
