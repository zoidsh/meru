import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication } from "@playwright/test";

import {
  SHELL_URL,
  chooseContextMenuItem,
  expect,
  findPage,
  openContextMenu,
  readOpenedExternally,
  stubSystemBrowser,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { CALENDAR_TITLE, ELSEWHERE_URL } from "./lib/stand-in.ts";

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

interface CapturedDefaultBrowser {
  isMeru: boolean;
  answer: "settings" | "copy" | "cancel";
  asked: { message: string; detail: string; buttons: { label: string }[] }[];
  settingsOpened: number;
}

/**
 * Makes the suite's system say Meru is its default browser, answering its
 * alert so, once main has made its stand-in.
 */
const makeMeruDefault = async (
  app: ElectronApplication,
  answer: CapturedDefaultBrowser["answer"]
) => {
  await expect
    .poll(() =>
      app.evaluate((_electron, next) => {
        const captured = Reflect.get(globalThis, "meruTestDefaultBrowser") as
          | CapturedDefaultBrowser
          | undefined;

        if (captured) {
          captured.isMeru = true;
          captured.answer = next;
        }

        return captured !== undefined;
      }, answer)
    )
    .toBe(true);
};

const readDefaultBrowser = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      Reflect.get(
        globalThis,
        "meruTestDefaultBrowser"
      ) as CapturedDefaultBrowser
  );

test("while Meru is the default browser a page's link shows the alert in place of asking, opens nothing, and opens the system's settings from it", async ({
  app,
  standIn,
}) => {
  await stubSystemBrowser(app);
  await makeMeruDefault(app, "settings");
  await clickAnotherSite(app, standIn.url);

  await expect
    .poll(async () => {
      const { settingsOpened } = await readDefaultBrowser(app);

      return settingsOpened;
    })
    .toBe(1);

  const { asked } = await readDefaultBrowser(app);

  expect(asked).toHaveLength(1);
  expect(asked[0]?.message).toBe("Meru is your default browser");
  expect(asked[0]?.buttons.map(({ label }) => label)).toStrictEqual(
    process.platform === "darwin"
      ? ["Open System Settings", "Copy Link", "Cancel"]
      : ["Copy Link", "OK"]
  );
  expect(await readAsked(app)).toStrictEqual([]);
  expect(await readOpenedExternally(app)).toStrictEqual([]);
});

test("while Meru is the default browser a tab's Open in Default Browser shows the alert too, and copies the link from it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "c",
            app: "calendar",
            url: standIn.calendarUrl,
            title: CALENDAR_TITLE,
          },
        ],
        selectedTabId: "c",
      },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);

  await findPage(app, standIn.calendarUrl);
  await stubSystemBrowser(app);
  await makeMeruDefault(app, "copy");
  await openContextMenu(app, () =>
    shell
      .getByRole("tablist", { name: "Tabs" })
      .getByRole("tab", { name: CALENDAR_TITLE, exact: true })
      .click({ button: "right" })
  );
  await chooseContextMenuItem(app, "Open in Default Browser");

  await expect.poll(() => readCopied(app)).toStrictEqual([standIn.calendarUrl]);

  const { asked } = await readDefaultBrowser(app);

  expect(asked).toHaveLength(1);
  expect(await readOpenedExternally(app)).toStrictEqual([]);
});
