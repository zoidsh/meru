// Email links handed to Meru: through the stand-in for macOS's `open-url`
// and through a real second launch's arguments. The compose window loads the
// Gmail stand-in, never the network, and the profile question is answered
// by the suite's build, never shown.
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import { DAY } from "#core/entitlement.ts";
import { composeUrl } from "#core/mailto.ts";

import {
  NO_TRIAL,
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  readOpenedExternally,
  readState,
  stubSystemBrowser,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import {
  emitSettingsFocus,
  openSection,
  openSettings,
  scopeTab,
  switchNamed,
} from "./lib/settings.ts";
import { ELSEWHERE_URL } from "./lib/stand-in.ts";
import type { StandIn } from "./lib/stand-in.ts";

const LINK =
  "mailto:someone@example.com?subject=Hello&cc=other@example.com&body=Line%20one";
const PRO_NEEDED = "Opening email links in Meru needs Meru Pro.";

/** Hands `url` in as macOS's `open-url` does. */
const openUrl = (app: ElectronApplication, url: string) =>
  app.evaluate(({ app: electron }, link) => {
    electron.emit("open-url", { preventDefault: () => false }, link);
  }, url);

/** Each window showing a compose address, with the profile whose session it is in. */
const composeWindows = (app: ElectronApplication) =>
  app.evaluate(
    ({ BrowserWindow, session }, profileIds) =>
      BrowserWindow.getAllWindows()
        .filter((window) =>
          window.webContents.getURL().includes("extsrc=mailto")
        )
        .map((window) => ({
          url: window.webContents.getURL(),
          profileId: profileIds.find(
            (id) =>
              session.fromPartition(`persist:${id}`) ===
              window.webContents.session
          ),
          size: window.getSize(),
          visible: window.isVisible(),
        })),
    ["personal", "work"]
  );

const questions = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (
        Reflect.get(globalThis, "meruTestQuestions") as
          | { asked: unknown[] }
          | undefined
      )?.asked ?? []
  );

// The stand-in is made only once the shell has loaded, which can come after
// the shell's page is found.
const answerQuestions = async (
  app: ElectronApplication,
  answer: number | "cancel"
) => {
  await expect
    .poll(() =>
      app.evaluate((_electron, given) => {
        const stand = Reflect.get(globalThis, "meruTestQuestions") as
          | { answer: number | "cancel" }
          | undefined;

        if (stand) {
          stand.answer = given;
        }

        return stand !== undefined;
      }, answer)
    )
    .toBe(true);
};

/** How many of the app's documents show the Pro toast's words. */
const toastsShown = async (app: ElectronApplication) => {
  const counts = await Promise.all(
    app
      .windows()
      .filter((page) => !page.isClosed())
      .map((page) =>
        page
          .getByText(PRO_NEEDED, { exact: true })
          .count()
          .catch(() => 0)
      )
  );

  return counts.reduce((sum, count) => sum + count, 0);
};

/** The main window's visibility. */
const mainWindowVisible = (app: ElectronApplication) =>
  app.evaluate(
    ({ BrowserWindow }, shellUrl) =>
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().startsWith(shellUrl))
        ?.isVisible() ?? false,
    SHELL_URL
  );

const gmailTab = (standIn: StandIn) => ({
  id: "gmail",
  app: "gmail",
  url: standIn.url,
  title: "",
  pinned: true,
  openAtLaunch: true,
});

/** Personal alone, or Personal and Work, each with its Gmail tab. */
const seedProfiles = (
  userDataDir: string,
  standIn: StandIn,
  names: readonly string[]
) =>
  writeState(userDataDir, {
    profiles: names.map((name) => ({
      id: name.toLowerCase(),
      name,
      tabs: [gmailTab(standIn)],
      selectedTabId: "gmail",
    })),
    selectedProfileId: "personal",
  });

/** Seeds what the entitlement stand-in remembers of this install. */
const writeStub = (userDataDir: string, record: object) =>
  writeFile(
    path.join(userDataDir, "entitlement-stub.json"),
    JSON.stringify({ licenses: {}, ...record })
  );

const entitlementSnapshot = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestEntitlement") as {
        snapshot: () => { status: string; trialChoicePending: boolean };
      }
    ).snapshot()
  );

test("a mailto link opens a compose window in the one profile's session, asking nothing and adding no tab", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Personal"]);

  const app = await launchApp();

  await findPage(app, standIn.url);

  const before = await readState<{ profiles: { tabs: unknown[] }[] }>(
    userDataDir
  );

  await openUrl(app, LINK);

  await expect
    .poll(() => composeWindows(app))
    .toStrictEqual([
      {
        url: composeUrl(standIn.url, LINK),
        profileId: "personal",
        size: [800, 600],
        visible: true,
      },
    ]);
  expect(await questions(app)).toStrictEqual([]);
  const after = await readState<typeof before>(userDataDir);

  expect(after.profiles[0]?.tabs).toStrictEqual(before.profiles[0]?.tabs);

  // Quitting with it open saves as ever, and nothing brings it back.
  await app.close();

  const saved = await readState<typeof before>(userDataDir);
  const again = await launchApp();

  await findPage(again, standIn.url);
  await delay(500);
  expect(saved.profiles[0]?.tabs).toStrictEqual(before.profiles[0]?.tabs);
  expect(await composeWindows(again)).toStrictEqual([]);
});

test("a link in the compose window leaves for the default browser, as one in Gmail's pop-out does", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Personal"]);

  const app = await launchApp();

  await findPage(app, standIn.url);
  await stubSystemBrowser(app);
  await openUrl(app, LINK);

  const compose = await findPage(app, composeUrl(standIn.url, LINK));

  await compose.getByRole("link", { name: "Another site" }).click();

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL]);
  expect(compose.isClosed()).toBeFalsy();
});

test("a second launch's link opens a compose window, and anything but mailto is ignored", async ({
  launchApp,
  spawnApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Personal"]);

  const app = await launchApp();

  await findPage(app, standIn.url);

  const second = spawnApp(["https://example.com/", LINK]);

  // The second launch hands its arguments over and quits.
  expect(await second.exited).toBe(0);
  await expect
    .poll(() => composeWindows(app))
    .toMatchObject([
      { url: composeUrl(standIn.url, LINK), profileId: "personal" },
    ]);

  // Only the one window: the web link opened nothing.
  await delay(500);
  expect(await composeWindows(app)).toHaveLength(1);
});

test("with two profiles Meru asks which one writes, and opens the compose window in the one chosen", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Personal", "Work"]);

  const app = await launchApp();

  await findPage(app, standIn.url);
  await answerQuestions(app, 1);
  await openUrl(app, LINK);

  await expect
    .poll(() => composeWindows(app))
    .toMatchObject([{ url: composeUrl(standIn.url, LINK), profileId: "work" }]);
  expect(await questions(app)).toStrictEqual([
    {
      message: "Which profile should write this email?",
      buttons: ["Personal", "Work", "Cancel"],
      cancelId: 2,
    },
  ]);
});

test("Cancel in the profile question opens nothing", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Personal", "Work"]);

  const app = await launchApp();

  await findPage(app, standIn.url);
  await answerQuestions(app, "cancel");
  await openUrl(app, LINK);

  await expect.poll(() => questions(app)).toHaveLength(1);
  await delay(500);
  expect(await composeWindows(app)).toStrictEqual([]);
});

test("without Meru Pro a link opens nothing and says so in a toast, showing the hidden main window for it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Personal", "Work"]);
  await writeStub(userDataDir, { trialStartedAt: Date.now() - 15 * DAY });
  await writeSettings(userDataDir, { openInBackground: true });

  const app = await launchApp(NO_TRIAL);
  const overlay = await findOverlayDocument(app);

  await expect
    .poll(() => entitlementSnapshot(app))
    .toMatchObject({ status: "trialEnded" });
  await openUrl(app, LINK);

  await expect(overlay.getByText(PRO_NEEDED, { exact: true })).toBeVisible();
  await expect.poll(() => mainWindowVisible(app)).toBe(true);
  expect(await questions(app)).toStrictEqual([]);
  expect(await composeWindows(app)).toStrictEqual([]);
});

test("a link that comes while the trial-ended screen waits is answered once the person has chosen", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await seedProfiles(userDataDir, standIn, ["Personal", "Work"]);
  await writeStub(userDataDir, { trialStartedAt: Date.now() - 15 * DAY });

  // The launch after the one that found the trial ended asks first.
  const first = await launchApp(NO_TRIAL);

  await findPage(first, SHELL_URL);
  await expect
    .poll(() => entitlementSnapshot(first))
    .toMatchObject({ status: "trialEnded", trialChoicePending: true });
  await first.close();

  const app = await launchApp(NO_TRIAL);
  const shell = await findPage(app, SHELL_URL);
  const choose = shell.getByRole("button", {
    name: "Continue with Free Version",
  });

  await expect(choose).toBeVisible();
  await openUrl(app, LINK);
  await delay(500);

  expect(await toastsShown(app)).toBe(0);
  expect(await questions(app)).toStrictEqual([]);

  await choose.click();

  const overlay = await findOverlayDocument(app);

  await expect(overlay.getByText(PRO_NEEDED, { exact: true })).toBeVisible();
  expect(await composeWindows(app)).toStrictEqual([]);
});

const SWITCH = "Open email links in Meru";
const WINDOWS_BUTTON = "Open Windows Settings";
const onWindows = process.platform === "win32";

/** What the suite's stand-in for the system's mail handler was asked. */
const mailHandler = (
  app: ElectronApplication,
  field: "calls" | "settingsOpened"
) =>
  app.evaluate(
    (_electron, name) =>
      (
        Reflect.get(globalThis, "meruTestMailHandler") as
          | Record<string, unknown>
          | undefined
      )?.[name],
    field
  );

/** Sets what the stand-in answers, as the system would hold it. */
const setMailHandler = (
  app: ElectronApplication,
  values: { real?: boolean; isDefault?: boolean }
) =>
  app.evaluate((_electron, given) => {
    Object.assign(
      Reflect.get(globalThis, "meruTestMailHandler") as object,
      given
    );
  }, values);

const openGeneral = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "General");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("General");

  return page;
};

const group = (page: Page, name: string) =>
  page.getByRole("group", { name, exact: true });

/** Where each group's top is on the page, in the order named. */
const tops = (page: Page, names: readonly string[]) =>
  Promise.all(
    names.map(async (name) => {
      const box = await group(page, name).boundingBox();

      return box?.y;
    })
  );

test.describe("the General page's Email links", () => {
  test("come after Startup, a switch on macOS and Linux and a button to Windows Settings on Windows", async ({
    app,
  }) => {
    const page = await openGeneral(app);

    await expect(group(page, "Email links")).toBeVisible();

    const [startup = 0, emailLinks = 0, downloads = 0] = await tops(page, [
      "Startup",
      "Email links",
      "Downloads",
    ]);

    expect(startup).toBeLessThan(emailLinks);
    expect(emailLinks).toBeLessThan(downloads);

    if (onWindows) {
      const button = page.getByRole("button", { name: WINDOWS_BUTTON });

      await expect(button).toBeEnabled();
      await expect(button).toHaveAccessibleDescription(
        "To open email links in Meru, choose it in Windows Settings."
      );
      await expect(switchNamed(page, SWITCH)).toHaveCount(0);
    } else {
      const toggle = switchNamed(page, SWITCH);

      await expect(toggle).not.toBeChecked();
      await expect(toggle).toHaveAccessibleDescription(
        "If you have more than one profile, Meru asks which one to use."
      );
      await expect(
        page.getByRole("button", { name: WINDOWS_BUTTON })
      ).toHaveCount(0);
    }
  });

  test("the switch makes Meru the mail handler, and off gives the links back on macOS while Linux keeps it on", async ({
    app,
  }) => {
    test.skip(onWindows, "Windows chooses the mail app in its own settings");

    const page = await openGeneral(app);
    const toggle = switchNamed(page, SWITCH);

    await toggle.click();
    await expect(toggle).toBeChecked();

    if (process.platform === "linux") {
      await expect(toggle).toBeDisabled();
      await expect(toggle).toHaveAccessibleDescription(
        "Meru opens email links. To change this, choose another app in your system settings."
      );
      expect(await mailHandler(app, "calls")).toStrictEqual([true]);

      return;
    }

    await toggle.click();
    await expect(toggle).not.toBeChecked();
    expect(await mailHandler(app, "calls")).toStrictEqual([true, false]);
  });

  test("the system's answer is read again as the Settings window regains focus", async ({
    app,
  }) => {
    const page = await openGeneral(app);

    await setMailHandler(app, { isDefault: true });
    await emitSettingsFocus(app, "blur");
    await emitSettingsFocus(app, "focus");

    await (onWindows
      ? expect(
          page.getByRole("button", { name: WINDOWS_BUTTON })
        ).toHaveAccessibleDescription("Meru opens email links.")
      : expect(switchNamed(page, SWITCH)).toBeChecked());
  });

  test("Open Windows Settings opens Default apps through the stand-in", async ({
    app,
  }) => {
    test.skip(!onWindows, "Only Windows has the button");

    const page = await openGeneral(app);

    await page.getByRole("button", { name: WINDOWS_BUTTON }).click();

    await expect.poll(() => mailHandler(app, "settingsOpened")).toBe(1);
  });

  test("a build that is not a release's shows the row disabled, saying it can open none", async ({
    app,
  }) => {
    // Set once main has wired it, before the Settings window reads it.
    await expect.poll(() => mailHandler(app, "calls")).toStrictEqual([]);
    await setMailHandler(app, { real: false });

    const page = await openGeneral(app);
    const control = onWindows
      ? page.getByRole("button", { name: WINDOWS_BUTTON })
      : switchNamed(page, SWITCH);

    await expect(control).toBeDisabled();
    await expect(control).toHaveAccessibleDescription(
      "This development build can't open email links."
    );
  });

  test("on the free version the row is a Pro row, disabled", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    await seedProfiles(userDataDir, standIn, ["Personal"]);
    await writeStub(userDataDir, { trialStartedAt: Date.now() - 15 * DAY });

    const app = await launchApp(NO_TRIAL);

    await findPage(app, SHELL_URL);
    await expect
      .poll(() => entitlementSnapshot(app))
      .toMatchObject({ status: "trialEnded" });

    const page = await openGeneral(app);
    const label = onWindows ? "Default mail app" : SWITCH;
    const control = onWindows
      ? page.getByRole("button", { name: WINDOWS_BUTTON })
      : switchNamed(page, SWITCH);

    await expect(
      page.getByRole("button", { name: `Meru Pro ${label}`, exact: true })
    ).toBeVisible();
    await expect(control).toBeDisabled();
  });

  test("are left out of a profile's scope", async ({
    launchApp,
    userDataDir,
    standIn,
  }) => {
    await seedProfiles(userDataDir, standIn, ["Personal", "Work"]);

    const app = await launchApp();
    const page = await openGeneral(app);

    await expect(group(page, "Email links")).toBeVisible();
    await scopeTab(page, "Work").click();
    await expect(group(page, "Downloads")).toBeVisible();
    await expect(group(page, "Email links")).toHaveCount(0);
  });
});
