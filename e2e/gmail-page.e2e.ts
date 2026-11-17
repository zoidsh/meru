import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import type { GmailHealth } from "#contract/gmail.ts";
import type { GmailFeature } from "#core/gmail-hooks.ts";

import { expect, findPage, test } from "./lib/app.ts";
import { GMAIL_PARTS, POPUP_TITLE, SIGN_IN_TITLE } from "./lib/stand-in.ts";

interface Captured {
  health: (GmailHealth & { profileId: string; tabId: string })[];
  refused: (string | undefined)[];
}

const readCaptured = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestGmailPage") as Captured);

const readHealth = async (app: ElectronApplication) => {
  const { health } = await readCaptured(app);

  return health;
};

const lastHooks = async (app: ElectronApplication) => {
  const health = await readHealth(app);

  return health.at(-1)?.hooks;
};

const readRefused = async (app: ElectronApplication) => {
  const { refused } = await readCaptured(app);

  return refused;
};

const setSetting = (
  app: ElectronApplication,
  key: GmailFeature,
  value: boolean
) =>
  app.evaluate(
    async (_electron, [settingKey, settingValue]) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set(settingKey, settingValue);
    },
    [key, value] as const
  );

/** Each of the stand-in's parts a hide takes, as the page shows it. */
const parts = (view: Page) => ({
  hideGmailLogo: view.getByRole("img", { name: GMAIL_PARTS.logo }),
  hidePromoBanner: view.getByText(GMAIL_PARTS.promo),
  hideUpgradeButton: view.getByRole("link", { name: GMAIL_PARTS.upgrade }),
  hideInboxFooter: view.getByRole("link", { name: GMAIL_PARTS.policy }),
});

/** What a hide may never take, whatever it matches. */
const expectUntouched = async (view: Page) => {
  await expect(
    view.getByRole("table", { name: GMAIL_PARTS.list })
  ).toBeVisible();
  await expect(
    view.getByRole("textbox", { name: GMAIL_PARTS.search })
  ).toBeVisible();
  await expect(view.getByRole("main")).toBeVisible();
};

/** Moves within the page, as Gmail does between views. */
const moveTo = (view: Page, hash: string) =>
  view.evaluate((next) => {
    location.hash = next;
  }, hash);

test("hides each of Gmail's parts by default, and reports every hook matched in the list", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await Promise.all(
    Object.values(parts(view)).map((part) => expect(part).toBeHidden())
  );

  await expectUntouched(view);
  await expect
    .poll(() => readHealth(app))
    .toMatchObject([
      {
        views: ["list"],
        hooks: {
          logo: "matched",
          footer: "matched",
          promo: "matched",
          upgrade: "matched",
        },
      },
    ]);
});

test("shows each part whose hide is off at launch", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeFile(
    path.join(userDataDir, "settings.json"),
    JSON.stringify({
      version: 1,
      hideGmailLogo: false,
      hideInboxFooter: false,
      hidePromoBanner: false,
      hideUpgradeButton: false,
    })
  );

  const app = await launchApp();
  const view = await findPage(app, standIn.url);

  await Promise.all(
    Object.values(parts(view)).map((part) => expect(part).toBeVisible())
  );

  await expectUntouched(view);
});

test("switches each hide off and on again while the page stays loaded, touching the others not", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);
  const all = parts(view);

  await expect(all.hideGmailLogo).toBeHidden();
  await view.evaluate(() => {
    Reflect.set(window, "keptAcrossSwitches", true);
  });

  for (const [feature, part] of Object.entries(all) as [
    GmailFeature,
    (typeof all)[GmailFeature],
  ][]) {
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await setSetting(app, feature, false);
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await expect(part).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await Promise.all(
      Object.entries(all)
        .filter(([other]) => other !== feature)
        .map(([, other]) => expect(other).toBeHidden())
    );
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await setSetting(app, feature, true);
    // oxlint-disable-next-line no-await-in-loop -- one switch at a time
    await expect(part).toBeHidden();
  }

  await expectUntouched(view);
  // Applied live, never by a reload.
  expect(
    await view.evaluate(() => Reflect.get(window, "keptAcrossSwitches"))
  ).toBe(true);
});

test("reports a hook broken when the markup it anchors on goes, and absent when its content does", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await expect.poll(() => readHealth(app)).toHaveLength(1);

  // As Gmail might rename its markup: the footer's container loses its role
  // while its policy link stays, and the logo's image goes.
  await view.evaluate(() => {
    document.querySelector('[role="contentinfo"]')?.removeAttribute("role");
    document.querySelector('header a[href="#inbox"] > img')?.remove();
    document
      .querySelector("[data-rp-onramp-container] > p")
      ?.parentElement?.remove();
  });
  await moveTo(view, "#inbox/renamed");

  // The check waits for the view to settle, and looks again before calling a
  // hook broken.
  await expect
    .poll(() => lastHooks(app), {
      timeout: 15_000,
    })
    .toStrictEqual({
      logo: "broken",
      footer: "broken",
      promo: "absent",
      upgrade: "matched",
    });
  // A broken hook does nothing: the policy link it no longer reaches shows.
  await expect(parts(view).hideInboxFooter).toBeVisible();
  await expectUntouched(view);
});

test("drops the handshake of a document off Gmail's origin in Gmail's view, which then hides nothing", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await expect(parts(view).hideUpgradeButton).toBeHidden();
  await view.evaluate((url) => {
    location.href = url;
  }, standIn.signInUrl);
  await expect(
    view.getByRole("heading", { name: SIGN_IN_TITLE })
  ).toBeVisible();
  await expect(parts(view).hideUpgradeButton).toBeVisible();

  await setSetting(app, "hideUpgradeButton", false);
  await setSetting(app, "hideUpgradeButton", true);
  await expect(parts(view).hideUpgradeButton).toBeVisible();
  // A Gmail tab's hop through sign-in is ordinary, so it is dropped silently.
  expect(await readRefused(app)).toStrictEqual([]);
});

test("gives Gmail's preload to Gmail's view alone: not to another app's, nor to a window Gmail opens", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await view.getByRole("link", { name: "Open a pop-up" }).click();

  const popup = await findPage(app, standIn.popupUrl);

  await expect(popup.getByRole("heading", { name: POPUP_TITLE })).toBeVisible();
  await view.getByRole("link", { name: "Open Calendar" }).click();
  await findPage(app, standIn.calendarUrl);

  const preloads = await app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((each) => {
      // getLastWebPreferences() leaves the preload out; this is what
      // Electron's own sandbox loader reads it from.
      const script = (
        Reflect.get(each, "_getPreloadScript") as () => {
          filePath: string;
        } | null
      ).call(each);

      return {
        url: each.getURL(),
        preload: script && script.filePath.split("/").at(-1),
      };
    })
  );
  const preloadOf = (url: string) =>
    preloads
      .filter((each) => each.url.startsWith(url))
      .map((each) => each.preload);

  expect(preloadOf(standIn.url)).toStrictEqual(["preload-gmail.cjs"]);
  expect(preloadOf(standIn.calendarUrl)).toStrictEqual([null]);
  expect(preloadOf(standIn.popupUrl)).toStrictEqual([null]);
  expect(
    preloads.filter((each) => each.preload === "preload-gmail.cjs")
  ).toHaveLength(1);
});
