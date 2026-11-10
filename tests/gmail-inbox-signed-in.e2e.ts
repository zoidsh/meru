/*
 * The real Gmail inbox, rendered in an account view on the signed-in profile.
 *
 * Every other launch loads a stand-in for Gmail, so this is the one test that
 * the page Google actually serves Meru's user agent still comes up as an inbox.
 * Running it is also what keeps the profile signed in: `useSignedInProApp`
 * writes the session the run rotated back to it.
 */
import { expect, test } from "@playwright/test";
import { redactGoogleUrl, signedInProfile, useSignedInProApp } from "./lib/app";

const signedIn = signedInProfile();

/*
 * At file scope, for the reason `deep-link-signed-in.e2e.ts` gives. Google ties
 * a session to the machine and browser that signed it in, so a copy of this
 * Mac's profile run anywhere else signs the account out for every run.
 */
test.skip(
  process.platform !== "darwin",
  "the signed-in profile is signed in on macOS, and Google signs out a copy run on another OS",
);

test.skip(
  !signedIn,
  "no signed-in profile at MERU_TEST_PROFILE_DIR, or no MERU_TEST_ACCOUNT_EMAIL",
);

const meru = useSignedInProApp();

const accountEmail = signedIn?.email ?? "";

const SIGNED_OUT_MESSAGE = `${signedIn?.directory ?? "e2e-signed-in"} is signed out: sign it in again with \`bun run dev --profile e2e-signed-in\`, as signedInProfile in tests/lib/app.ts describes`;

const GMAIL_INBOX_URL = "https://mail.google.com/mail/";

/*
 * Signed out, Gmail sends the view to the sign-in page or, past the account
 * chooser, to its own marketing page.
 */
const SIGNED_OUT_URLS = ["https://accounts.google.com/", "https://workspace.google.com/"];

function findPage(prefixes: string[]) {
  return meru.app
    .windows()
    .find((window) => prefixes.some((prefix) => window.url().startsWith(prefix)));
}

test("the signed-in profile shows its Gmail inbox", async () => {
  await expect
    .poll(() => Boolean(findPage([GMAIL_INBOX_URL, ...SIGNED_OUT_URLS])), {
      message: "No account view reached Gmail or Google's sign-in page",
    })
    .toBe(true);

  const gmail = findPage([GMAIL_INBOX_URL]);

  if (!gmail) {
    throw new Error(
      `${SIGNED_OUT_MESSAGE}. The account view is on ${redactGoogleUrl(findPage(SIGNED_OUT_URLS)?.url() ?? "")}`,
    );
  }

  // Compared in the page and reported as a boolean, so the address stays out of
  // the log either way.
  await expect
    .poll(
      () =>
        gmail.evaluate(
          (email) =>
            [...document.querySelectorAll("[aria-label]")].some((element) =>
              element.getAttribute("aria-label")?.includes(email),
            ),
          accountEmail,
        ),
      { message: "Gmail never showed the address MERU_TEST_ACCOUNT_EMAIL names" },
    )
    .toBe(true);

  await expect(gmail.locator("tr.zA").first(), "The inbox shows no message rows").toBeVisible();
});
