/*
 * The `meru://open?url=…` route, driven the way a link router on the desktop
 * drives it.
 *
 * Nothing below the end-to-end level reaches this. The route is a decision made
 * out of a process argument list, handed across the single instance lock, and
 * paid off as a child `WebContentsView` — three things that exist only in a
 * launched app, and the last of which a screenshot cannot see. `tests/lib/
 * deep-link.ts` has how the link is delivered.
 *
 * Under a license, because every `meru://` route is Pro-gated. The free
 * version's side of that is in `tests/deep-link.e2e.ts`, a file of its own
 * because `useApp` is called at module scope and seeds every test in the file it
 * is called in.
 *
 * One account, which is what lets the prompt be left out of the picture:
 * `promptForAccount` answers with the only account rather than opening a dialog
 * nobody is here to dismiss. The addressed form, `meru://<email>/open?url=…`,
 * is not covered — it resolves against `gmail.userEmail`, which the Gmail
 * preload only learns from a signed-in page, and nothing here signs in.
 */
import { expect, test } from "@playwright/test";
import { seedAccount } from "./lib/accounts";
import { useProApp } from "./lib/app";
import { sendDeepLink } from "./lib/deep-link";
import { readViews } from "./lib/views";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

const MEET_URL = "https://meet.google.com/abc-defg-hij";

/** The URL `resolveRoutableUrl`'s host check exists for; its docblock has why. */
const SPOOFED_MEET_URL = "https://evil.com/meet.google.com/x";

function meruOpenUrl(url: string) {
  return `meru://open?url=${encodeURIComponent(url)}`;
}

const meru = useProApp({
  accounts: [seedAccount({ id: ACCOUNT_ID, label: "Personal" })],
  /*
   * Both at their defaults, seeded rather than relied on. They are the two
   * settings the routing reads — `openUrl` sends a URL to the browser with the
   * first off, and opens a window rather than a child view with the second on
   * "windows" — so a change to either default would otherwise turn this file
   * red for a reason that has nothing to do with the route.
   */
  "workspaceApps.openInApp": true,
  "workspaceApps.mode": "tabs",
});

// At file scope rather than in a hook, as in `native-resize.e2e.ts`: the
// harness above registers its `beforeEach` first, and hooks run in registration
// order, so skipping from inside one would launch the app before deciding not
// to use it.
test.skip(
  process.platform === "darwin",
  "macOS delivers a meru:// URL through open-url to the running app, which spawning the executable cannot reach",
);

/** Every child view's URL, which is what a deep link either adds to or does not. */
function readViewUrls() {
  return readViews(meru).then((views) => views.map((view) => view.url));
}

test("meru://open opens a Google link in the account's own view", async () => {
  await sendDeepLink(meru, meruOpenUrl(MEET_URL));

  /*
   * Polled, because the exit of the second instance says only that its argv was
   * handed over — everything the running app does with it happens afterwards.
   *
   * On the URL rather than anything in the page: what loads is a real Google
   * property, and the claim here is about which URL the app decided to open,
   * not about what Google served back.
   */
  await expect
    .poll(async () =>
      (await readViewUrls()).some((url) => url.startsWith("https://meet.google.com")),
    )
    .toBe(true);
});

test("meru://open refuses a URL that only looks like Google's", async () => {
  const viewUrlsBefore = await readViewUrls();

  await sendDeepLink(meru, meruOpenUrl(SPOOFED_MEET_URL));

  /*
   * A link that does open, sent behind the one that must not, so the claim has
   * something to wait for rather than a fixed pause standing in for one.
   * `second-instance` arrives in the order the instances hand over, and with a
   * single account `openUrlDeepLink` reaches the view without awaiting
   * anything, so a Meet view is proof the app is done with the link before it.
   */
  await sendDeepLink(meru, meruOpenUrl(MEET_URL));

  await expect
    .poll(async () =>
      (await readViewUrls()).some((url) => url.startsWith("https://meet.google.com")),
    )
    .toBe(true);

  const viewUrls = await readViewUrls();

  /*
   * One view more than before, the Meet one — so the refused link added none of
   * its own — and nothing went to the host that URL actually names.
   */
  expect(viewUrls).toHaveLength(viewUrlsBefore.length + 1);

  expect(viewUrls.filter((url) => url.includes("evil.com"))).toEqual([]);
});
