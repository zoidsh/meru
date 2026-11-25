import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication } from "@playwright/test";

import {
  expect,
  findPage,
  readOpenedExternally,
  stubSystemBrowser,
  test,
  writeSettings,
} from "./lib/app.ts";
import { ELSEWHERE_URL } from "./lib/stand-in.ts";

interface Captured {
  asked: { message: string; detail: string; trustLabel: string }[];
  answer: { choice: "open" | "copy" | "cancel"; trust: boolean };
}

/**
 * Has the suite's link prompt answer every question from now on this way,
 * once main has made it.
 */
const answerPrompts = async (
  app: ElectronApplication,
  answer: Captured["answer"]
) => {
  await expect
    .poll(() =>
      app.evaluate((_electron, next) => {
        const captured = Reflect.get(globalThis, "meruTestLinkPrompts") as
          | Captured
          | undefined;

        if (captured) {
          captured.answer = next;
        }

        return captured !== undefined;
      }, answer)
    )
    .toBe(true);
};

const readAsked = (app: ElectronApplication) =>
  app.evaluate(
    () => (Reflect.get(globalThis, "meruTestLinkPrompts") as Captured).asked
  );

const readCopied = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestClipboard") as string[]);

const readTrusted = async (userDataDir: string) => {
  const settings = JSON.parse(
    await readFile(path.join(userDataDir, "settings.json"), "utf-8")
  ) as { trustedSites?: unknown };

  return settings.trustedSites;
};

const clickAnotherSite = async (app: ElectronApplication, gmailUrl: string) => {
  const view = await findPage(app, gmailUrl);

  await view.getByRole("link", { name: "Another site" }).click();
};

test("asks before a page's link opens in the default browser, showing the link and its site, and opens it on Open Link", async ({
  app,
  standIn,
}) => {
  await stubSystemBrowser(app);
  await clickAnotherSite(app, standIn.url);

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL]);
  expect(await readAsked(app)).toStrictEqual([
    {
      message: "Open this link in your default browser?",
      detail: ELSEWHERE_URL,
      openLabel: "Open Link",
      copyLabel: "Copy Link",
      cancelLabel: "Cancel",
      trustLabel: "Always open links to example.com without asking",
    },
  ]);
});

test("opens nothing on Cancel, and copies the link without opening it on Copy Link", async ({
  app,
  standIn,
}) => {
  await stubSystemBrowser(app);
  await answerPrompts(app, { choice: "cancel", trust: true });
  await clickAnotherSite(app, standIn.url);
  await expect.poll(() => readAsked(app)).toHaveLength(1);

  await answerPrompts(app, { choice: "copy", trust: false });
  await clickAnotherSite(app, standIn.url);

  await expect.poll(() => readCopied(app)).toStrictEqual([ELSEWHERE_URL]);
  expect(await readOpenedExternally(app)).toStrictEqual([]);
});

test("trusts the site when ticked, keeping it in settings.json, and opens its next link without asking", async ({
  app,
  standIn,
  userDataDir,
}) => {
  await stubSystemBrowser(app);
  await answerPrompts(app, { choice: "open", trust: true });
  await clickAnotherSite(app, standIn.url);

  await expect
    .poll(() => readTrusted(userDataDir))
    .toStrictEqual(["https://example.com"]);

  await clickAnotherSite(app, standIn.url);

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL, ELSEWHERE_URL]);
  expect(await readAsked(app)).toHaveLength(1);
});

test("opens without asking for a site trusted in settings.json, and for every site with asking off", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { trustedSites: ["https://example.com"] });

  const trusting = await launchApp();

  await stubSystemBrowser(trusting);
  await clickAnotherSite(trusting, standIn.url);
  await expect
    .poll(() => readOpenedExternally(trusting))
    .toStrictEqual([ELSEWHERE_URL]);
  expect(await readAsked(trusting)).toStrictEqual([]);
  await trusting.close();

  await writeSettings(userDataDir, { confirmLinks: false });

  const unasking = await launchApp();

  await stubSystemBrowser(unasking);
  await clickAnotherSite(unasking, standIn.url);
  await expect
    .poll(() => readOpenedExternally(unasking))
    .toStrictEqual([ELSEWHERE_URL]);
  expect(await readAsked(unasking)).toStrictEqual([]);
});
