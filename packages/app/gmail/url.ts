import { GMAIL_URL } from "@meru/shared/gmail";
import { log } from "@/lib/log";

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Where an account's view loads Gmail from, and what the main process holds
 * that view's URL against.
 *
 * `MERU_E2E_GMAIL_URL` points both at a page the end-to-end suite serves
 * itself, so that no test depends on Google being reachable or on which
 * sign-in page Google decides to serve a signed-out view. Read at runtime
 * rather than inlined by `scripts/build.ts` the way `MERU_API_URL` is, because
 * the suite runs the packaged app and the launch is where it hands this over.
 *
 * Loopback only, for the reason the fixture extension's flag is a boolean: a
 * shipped app reads this too, and one that took any URL would hand it "show
 * this page as the user's inbox" from an environment variable.
 */
export function resolveGmailUrl() {
  const url = process.env.MERU_E2E_GMAIL_URL;

  if (!url) {
    return GMAIL_URL;
  }

  if (!URL.canParse(url) || !LOOPBACK_HOSTNAMES.has(new URL(url).hostname)) {
    log.warn("Ignoring MERU_E2E_GMAIL_URL, which is not a loopback URL", { url });

    return GMAIL_URL;
  }

  return url;
}

export const gmailUrl = resolveGmailUrl();
