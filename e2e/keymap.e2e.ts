import type { Page } from "@playwright/test";
import { delay } from "es-toolkit";

import {
  expect,
  findOverlayDocument,
  findPage,
  test,
  writeState,
} from "./lib/app.ts";
import { FORMER_KEYS, KEYS, pressInPage } from "./lib/keys.ts";

/** By the name it starts with: a profile not signed in also says so. */
const profileButton = (shell: Page, name: string) =>
  shell
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: new RegExp(`^${name}(,|$)`, "u") });

test("Meru's former keys for Reload, Find and Select Profile reach the page, which Google's apps use, and Meru does nothing with them; the keys that replaced them act, as do Back's and Downloads'", async ({
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
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "c",
      },
      { id: "q", name: "Work" },
    ],
    selectedProfileId: "p",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const calendar = await findPage(app, standIn.calendarUrl);
  const overlay = await findOverlayDocument(app);
  const bar = overlay.getByRole("search", { name: "Find in page" });
  const cdp = await calendar.context().newCDPSession(calendar);

  // Keys reach the page only once it holds Chromium's focus, which
  // Playwright otherwise makes every page claim.
  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await expect
    .poll(() => calendar.evaluate(() => document.hasFocus()))
    .toBe(true);
  await calendar.evaluate(() => {
    const seen: string[] = [];

    // Survives until the page loads again.
    Reflect.set(globalThis, "seenKeys", seen);
    document.addEventListener("keydown", (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        seen.push(event.key.toLowerCase());
      }
    });
  });

  const formerProfile = FORMER_KEYS.profile(2);
  const former = [
    FORMER_KEYS.reload,
    FORMER_KEYS.find,
    ...(formerProfile ? [formerProfile] : []),
  ];

  for (const key of former) {
    // oxlint-disable-next-line no-await-in-loop -- one key after another
    await pressInPage(app, standIn.calendarUrl, key);
  }

  await expect
    .poll(() => calendar.evaluate(() => Reflect.get(globalThis, "seenKeys")))
    .toStrictEqual(former.map(({ keyCode }) => keyCode.toLowerCase()));
  // Long enough for a reload, the bar or a selection to have begun.
  await delay(500);
  expect(
    await calendar.evaluate(
      () => Reflect.get(globalThis, "seenKeys") !== undefined
    )
  ).toBe(true);
  await expect(bar).toHaveCount(0);
  await expect(profileButton(shell, "Default")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // Off macOS an arrow's shortcut, which Meru hears before the page does.
  await calendar.evaluate(() => {
    history.pushState(undefined, "", "#later");
  });
  await pressInPage(app, standIn.calendarUrl, KEYS.back);
  await expect.poll(() => calendar.url()).not.toContain("#later");
  expect(
    await calendar.evaluate(() => Reflect.get(globalThis, "seenKeys"))
  ).toStrictEqual(former.map(({ keyCode }) => keyCode.toLowerCase()));

  await pressInPage(app, standIn.calendarUrl, KEYS.reload);
  await expect
    .poll(() =>
      calendar
        .evaluate(() => Reflect.get(globalThis, "seenKeys"))
        // Asked mid-load, the page has no context to answer from.
        .catch(() => "loading")
    )
    .toBeUndefined();
  await expect
    .poll(() => calendar.evaluate(() => document.hasFocus()))
    .toBe(true);

  await pressInPage(app, standIn.calendarUrl, KEYS.find);
  await expect(bar).toBeVisible();
  await bar.getByRole("button", { name: "Close" }).click();
  await expect(bar).toHaveCount(0);

  const downloads = overlay.getByRole("dialog", { name: "Downloads" });

  await pressInPage(app, standIn.calendarUrl, KEYS.downloads);
  await expect(downloads).toBeVisible();
  await pressInPage(app, standIn.calendarUrl, KEYS.downloads);
  await expect(downloads).toBeHidden();

  await pressInPage(app, standIn.calendarUrl, KEYS.profile(2));
  await expect(profileButton(shell, "Work")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
