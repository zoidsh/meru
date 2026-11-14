import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication } from "@playwright/test";

import { settings } from "../app/shared/channels/settings.ts";
import { invokeIn } from "../scripts/lib/app.ts";
import { expect, panesOf, profilesOf, test } from "./app.ts";
import { startGmailStub } from "./gmail-stub.ts";

const HEADER = `<!doctype html><title>Gmail</title>
<header role="banner"><div><div><a href="#inbox" aria-label="Gmail"><img alt="Gmail" /></a></div></div></header>`;

// A header Gmail has changed under the logo's selector entry, so the entry misses.
const CHANGED_HEADER = `<!doctype html><title>Gmail</title>
<header role="banner"><div><span aria-label="Gmail">Gmail</span></div></header>`;

/** Runs `code` in the Gmail pane's page and gives back what it answered. */
const inPane = async (app: ElectronApplication, code: string) => {
  const [pane] = await panesOf(app);
  if (pane === undefined) {
    throw new Error("The window shows no pane");
  }
  return await app.evaluate(
    async ({ webContents }, [contentsId, script]) => {
      const answer: unknown = await webContents
        .fromId(contentsId)
        ?.executeJavaScript(script, true);
      return answer;
    },
    [pane.contentsId, code] as const
  );
};

const styleShown = async (app: ElectronApplication) =>
  await inPane(
    app,
    'document.querySelector(\'style[data-meru-style="hideGmailLogo"]\') !== null && getComputedStyle(document.querySelector("header > div")).display === "none"'
  );

test("styles the Gmail pane from the settings, following a change at once, and reports a sign-in page", async ({
  launch,
}) => {
  const stub = await startGmailStub(HEADER);
  try {
    const { app, chrome } = await launch({
      env: { MERU_GMAIL_URL: stub.url },
    });
    await expect.poll(async () => await styleShown(app)).toBe(true);

    await invokeIn(chrome, settings.set, {
      key: "gmail.hideGmailLogo",
      value: false,
    });
    await expect.poll(async () => await styleShown(app)).toBe(false);

    await inPane(app, `location.href = ${JSON.stringify(stub.signIn)}`);
    await expect
      .poll(async () => {
        const { profiles } = await profilesOf(chrome);
        return profiles[0]?.status;
      })
      .toStrictEqual({ kind: "needsSignIn" });
  } finally {
    await stub.stop();
  }
});

test("writes a warning when a selector entry finds nothing on Gmail's page", async ({
  launch,
  userData,
}) => {
  test.setTimeout(40_000);
  const stub = await startGmailStub(CHANGED_HEADER);
  try {
    await launch({ env: { MERU_GMAIL_URL: stub.url } });
    // The preload waits out a grace of ten seconds before it calls a selector missing.
    await expect
      .poll(
        async () =>
          await readFile(path.join(userData, "logs", "main.log"), "utf-8"),
        { timeout: 25_000 }
      )
      .toContain('"A Gmail selector found nothing"');
  } finally {
    await stub.stop();
  }
});
