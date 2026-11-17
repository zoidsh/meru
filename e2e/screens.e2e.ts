// Pictures for a person to look at, taken with MERU_E2E_SHOTS=1; they assert
// nothing of what they show.
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";

import { expect, findPage, test } from "./lib/app.ts";
import {
  DESIGNS,
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import type { Design } from "./lib/shots.ts";
import {
  DARK_PARTS,
  POPOUT_PATH,
  THREAD_PARTS,
  openDarkThread,
  openThread,
} from "./lib/stand-in.ts";

test.beforeEach(() => {
  onlyWithShots();
});

const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  settings: object = {}
) => {
  await writeFile(
    path.join(userDataDir, "settings.json"),
    // A clear window, which a capture shows white, would hide the chrome.
    JSON.stringify({ version: 1, vibrancy: false, ...settings })
  );

  const app = await launchApp();

  return { app, shell: await findPage(app, "meru-app:") };
};

const setDesign = (app: ElectronApplication, design: Design) =>
  app.evaluate(async (_electron, value) => {
    const settings = Reflect.get(globalThis, "meruTestSettings") as {
      set: (key: string, value: unknown) => Promise<void>;
    };

    await settings.set("design", value);
  }, design);

/**
 * Shoots the whole window as `surface` in each design and theme; `around`
 * readies what is shown in a design, shooting in between.
 */
const shootEachWay = async (
  app: ElectronApplication,
  shell: Page,
  surface: string,
  around: (shoot: () => Promise<void>) => Promise<void> = (shoot) => shoot()
) => {
  for (const design of DESIGNS) {
    // oxlint-disable-next-line no-await-in-loop -- one design at a time
    await setDesign(app, design);
    // oxlint-disable-next-line no-await-in-loop -- one design at a time
    await around(async () => {
      for (const theme of THEMES) {
        // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
        await emulateTheme(app, theme);
        // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
        await shootWindow(app, shell, shotPath(surface, design, theme));
      }
    });
  }
};

test("the window with Gmail's page", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);

  await findPage(app, standIn.url);
  await shootEachWay(app, shell, "window");
});

test("the rename profile overlay", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const overlay = await findPage(app, "about:blank");
  const field = overlay.getByRole("textbox", { name: "Rename profile" });

  await findPage(app, standIn.url);
  await shootEachWay(app, shell, "rename", async (shoot) => {
    await app.evaluate(({ Menu, BrowserWindow }) => {
      Menu.getApplicationMenu()
        ?.getMenuItemById("profile.rename")
        ?.click(undefined, BrowserWindow.getAllWindows()[0]);
    });
    await expect(field).toBeFocused();
    await shoot();
    await overlay.keyboard.press("Escape");
    await expect(field).toHaveCount(0);
  });
});

test("a thread with every thread feature on", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir, {
    reverseConversation: true,
    moveAttachmentsToTop: true,
    showTrimmedContent: true,
  });
  const view = await findPage(app, standIn.url);

  await openThread(view, 3);
  await expect(view.getByText(THREAD_PARTS.quoted(1))).toBeVisible();
  await shootEachWay(app, shell, "thread");
});

test("a thread and a docked compose while Gmail is Dark, with the dark theme on and off", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell } = await launch(launchApp, userDataDir);
  const view = await findPage(app, standIn.url);
  const pane = view.getByRole("region", { name: DARK_PARTS.pane });
  const background = () =>
    pane.evaluate((element) => getComputedStyle(element).backgroundColor);

  await openDarkThread(view, true);
  await emulateTheme(app, "dark");

  for (const on of [true, false]) {
    // oxlint-disable-next-line no-await-in-loop -- one state at a time
    await app.evaluate(async (_electron, value) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set("extendDarkTheme", value);
    }, on);
    // oxlint-disable-next-line no-await-in-loop -- one state at a time
    await expect
      .poll(background)
      .toBe(on ? "rgba(0, 0, 0, 0)" : "rgb(255, 255, 255)");
    // oxlint-disable-next-line no-await-in-loop -- one state at a time
    await shootWindow(app, shell, shotPath(`gmail-dark-${on ? "on" : "off"}`));
  }
});

test("Gmail's pop-out, which shows Gmail's page alone in either design and theme", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await view.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, `${standIn.url}${POPOUT_PATH.slice(1)}`);

  await popout.screenshot({ path: shotPath("popout") });
});
