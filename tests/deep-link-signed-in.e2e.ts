/*
 * The addressed form of the open route, `meru://<email>/open?url=…`, which is
 * the half of it `tests/deep-link-pro.e2e.ts` cannot reach.
 *
 * An address resolves against `gmail.userEmail`, and the Gmail preload only
 * learns that from a signed-in page — so these tests need an account somebody
 * signed in by hand. `signedInProfile` in `tests/lib/app.ts` is where the
 * directory holding one comes from, and with none named this whole file skips,
 * which is how CI and every other checkout see it.
 *
 * A file of its own, because `useSignedInProApp` is called at module scope and
 * seeds every test in the file it is called in.
 */
import { expect, test } from "@playwright/test";
import type { Page } from "playwright";
import { signedInProfile, useSignedInProApp } from "./lib/app";
import { sendDeepLink } from "./lib/deep-link";
import { readViews } from "./lib/views";

const MEET_URL = "https://meet.google.com/abc-defg-hij";

/**
 * A second app rather than a second Meet link, so that the link expected to be
 * ignored and the link expected to be carried out cannot land in the same view.
 * Two Meet links share one, and a view opened by the wrong link and then
 * navigated by the right one reads exactly like the right one on its own.
 */
const CALENDAR_URL = "https://calendar.google.com/calendar/u/0/r";

const UNKNOWN_EMAIL = "nobody@example.com";

const GMAIL_URL = "https://mail.google.com";

const signedIn = signedInProfile();

/*
 * At file scope rather than in a hook, the way `native-resize.e2e.ts` skips a
 * platform: `useSignedInProApp` registers its own `beforeEach` below, hooks run
 * in registration order, and skipping from inside one would launch the app and
 * wait for its renderer before deciding not to use it.
 */
test.skip(
  process.platform === "darwin",
  "macOS delivers a meru:// URL through open-url to the running app, which spawning the executable cannot reach",
);

test.skip(
  !signedIn,
  "no signed-in profile is named in .env.test.local, by MERU_TEST_PROFILE_DIR and MERU_TEST_ACCOUNT_EMAIL",
);

const meru = useSignedInProApp({
  /*
   * Both at their defaults, seeded rather than relied on, for the reason
   * `deep-link-pro.e2e.ts` gives: they are the two settings the routing reads,
   * so a change to either default would otherwise turn this file red for a
   * reason that has nothing to do with the route. The accounts are the profile's
   * own and cannot be seeded here.
   */
  "workspaceApps.openInApp": true,
  "workspaceApps.mode": "tabs",
});

const accountEmail = signedIn?.email ?? "";

function meruOpenUrl(url: string, email: string) {
  return `meru://${email}/open?url=${encodeURIComponent(url)}`;
}

/** Every child view's URL, which is what a deep link either adds to or does not. */
function readViewUrls() {
  return readViews(meru).then((views) => views.map((view) => view.url));
}

/**
 * Waits until the Gmail view has told the main process which address it is
 * signed in as, and checks that it is the address these links are sent to.
 *
 * None of that is otherwise visible from out here: `gmail.userEmail` lives on a
 * `Gmail` instance no evaluate can reach, and it is set from the preload rather
 * than from the load, so a view that has finished loading is not yet a view the
 * app can resolve an address against. What can be seen is the element the
 * preload reads the address off — stamped `data-meru-user-email` in the line
 * before the send, so the attribute being there is the send having happened.
 *
 * A link delivered before that resolves to no account and opens nothing, which
 * is the outcome the second test below asserts on purpose.
 */
async function waitForSignedInAccount() {
  await expect
    .poll(() => meru.app.windows().some((window) => window.url().startsWith(GMAIL_URL)), {
      message: `The Gmail view never reached ${GMAIL_URL}, so ${signedIn?.directory} is signed out. Sign in there again.`,
    })
    .toBe(true);

  const gmail = meru.app.windows().find((window) => window.url().startsWith(GMAIL_URL)) as Page;

  const userEmailElement = gmail.locator("meta[name='og-profile-acct'][data-meru-user-email]");

  await expect(userEmailElement).toBeAttached();

  // The address the profile is actually signed in as. Asserted rather than
  // trusted, so that a stale MERU_TEST_ACCOUNT_EMAIL says so here instead of
  // turning up as a link that opens nothing.
  expect(await userEmailElement.getAttribute("content")).toBe(accountEmail);
}

test("meru://<email>/open opens a Google link in the account it addresses", async () => {
  await waitForSignedInAccount();

  await sendDeepLink(meru, meruOpenUrl(MEET_URL, accountEmail));

  /*
   * Polled, because the exit of the second instance says only that its argv was
   * handed over — everything the running app does with it happens afterwards.
   */
  await expect
    .poll(async () => (await readViewUrls()).some((url) => url.startsWith(MEET_URL)))
    .toBe(true);
});

test("meru://<email>/open opens nothing for an address no account is signed in as", async () => {
  await waitForSignedInAccount();

  const viewUrlsBefore = await readViewUrls();

  await sendDeepLink(meru, meruOpenUrl(CALENDAR_URL, UNKNOWN_EMAIL));

  /*
   * A link that does open, sent behind the one that must not, so the claim has
   * something to wait for rather than a fixed pause standing in for one.
   * `second-instance` arrives in the order the instances hand over, and an
   * addressed link resolves without awaiting anything, so a Meet view is proof
   * the app is done with the Calendar link before it.
   */
  await sendDeepLink(meru, meruOpenUrl(MEET_URL, accountEmail));

  await expect
    .poll(async () => (await readViewUrls()).some((url) => url.startsWith(MEET_URL)))
    .toBe(true);

  const viewUrls = await readViewUrls();

  /*
   * One view more than before, the Meet one — so the link addressed to nobody
   * added none of its own — and nothing went to the app that link named.
   */
  expect(viewUrls).toHaveLength(viewUrlsBefore.length + 1);

  expect(viewUrls.filter((url) => url.startsWith("https://calendar.google.com"))).toEqual([]);
});
