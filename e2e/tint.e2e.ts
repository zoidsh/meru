import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Locator, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import { PROFILE_COLOR_NAMES, paletteColor } from "#core/profile-color.ts";
import type { ProfileColorName } from "#core/profile-color.ts";
import { tonalTokens } from "#core/tonal-tint.ts";
import type { TonalRole, TonalTheme } from "#core/tonal-tint.ts";

import {
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  test,
  writeSettings,
  writeState,
} from "./lib/app.ts";
import { findTitlebar, readOwnWindows } from "./lib/own-window.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootOwnWindow,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import type { StandIn } from "./lib/stand-in.ts";

/** A role of `name`'s tonal palette as Chromium computes a colour. */
const tone = (name: ProfileColorName, theme: TonalTheme, role: TonalRole) => {
  const hex = tonalTokens(paletteColor(name), theme)[role];
  const [red, green, blue] = [1, 3, 5].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16)
  );

  return `rgb(${red}, ${green}, ${blue})`;
};

const background = (locator: Locator) =>
  locator.evaluate((element) => getComputedStyle(element).backgroundColor);

/** Every fill in `locator`'s element and inside it, outermost first. */
const fills = (locator: Locator) =>
  locator.evaluate((element) =>
    [element, ...element.querySelectorAll("*")].map(
      (inside) => getComputedStyle(inside).backgroundColor
    )
  );

/** The page's own colour, which the tint never takes, as the theme gives it. */
const pageColor = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

const PAGE_COLOR: Record<TonalTheme, string> = {
  light: "oklch(1 0 0)",
  dark: "oklch(0.145 0 0)",
};

const titlebarOf = (page: Page) =>
  page.getByRole("banner", { name: "Title bar" });

/**
 * Home, blue, with Calendar in a window of its own, and Work, amber,
 * selected; each a profile button in the titlebar.
 */
const twoProfiles = (standIn: StandIn, more: object = {}) => ({
  profiles: [
    {
      id: "home",
      name: "Home",
      color: "blue",
      tabs: [
        { id: "gmail", app: "gmail", url: standIn.url, title: "" },
        {
          id: "c",
          app: "calendar",
          url: standIn.calendarUrl,
          title: "",
          ownWindow: true,
          windowBounds: { x: 120, y: 120, width: 900, height: 600 },
        },
      ],
      selectedTabId: "gmail",
    },
    {
      id: "work",
      name: "Work",
      color: "amber",
      tabs: [{ id: "gmail", app: "gmail", url: standIn.url, title: "" }],
      selectedTabId: "gmail",
    },
  ],
  selectedProfileId: "work",
  ...more,
});

const openDownloads = async (shell: Page, overlay: Page) => {
  await titlebarOf(shell)
    .getByRole("button", { name: "Downloads", exact: true })
    .click();

  const card = overlay.getByRole("dialog", { name: "Downloads" });

  await expect(card).toBeVisible();

  return card;
};

test("the frame, the cards over it and a tab's own window take their profile's tonal palette, a change of profile at once", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, twoProfiles(standIn));

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const overlay = await findOverlayDocument(app);
  const ownTitlebar = titlebarOf(await findTitlebar(app));

  await expect
    .poll(() => background(titlebarOf(shell)))
    .toBe(tone("amber", "light", "shell"));
  // The window's own tab keeps its profile's, not the selected one's.
  await expect
    .poll(() => background(ownTitlebar))
    .toBe(tone("blue", "light", "shell"));

  const card = await openDownloads(shell, overlay);

  expect(await fills(card)).toContain(tone("amber", "light", "popover"));
  expect(await pageColor(shell)).toBe(PAGE_COLOR.light);

  await shell.keyboard.press("Escape");
  await overlay.keyboard.press("Escape");
  await titlebarOf(shell)
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: /^Home/u })
    .click();
  await expect
    .poll(() => background(titlebarOf(shell)))
    .toBe(tone("blue", "light", "shell"));
});

test("the palette follows the Theme setting, against the system's theme either way, the same theme as shadcn's own tokens", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, twoProfiles(standIn));

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const setTheme = (value: string) =>
    app.evaluate(async (_electron, theme) => {
      const settings = Reflect.get(globalThis, "meruTestSettings") as {
        set: (key: string, value: unknown) => Promise<void>;
      };

      await settings.set("theme", theme);
    }, value);
  const drawn = async () => [
    await background(titlebarOf(shell)),
    await pageColor(shell),
  ];

  // Playwright's light scheme off, so the page takes the theme Meru sets.
  await shell.emulateMedia({ colorScheme: null });

  for (const theme of ["dark", "light", "dark"] as const) {
    // oxlint-disable-next-line no-await-in-loop -- one theme after another
    await setTheme(theme);
    // oxlint-disable-next-line no-await-in-loop -- one theme after another
    await expect
      .poll(drawn)
      .toStrictEqual([tone("amber", theme, "shell"), PAGE_COLOR[theme]]);
  }
});

test("Tint with profile color off leaves the frame and the cards over it shadcn's greys, the frame's muted text today's", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { profileTint: false });
  await writeState(userDataDir, twoProfiles(standIn));

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const overlay = await findOverlayDocument(app);

  await expect
    .poll(() => background(titlebarOf(shell)))
    .toBe("rgb(235, 235, 235)");
  const ownTitlebar = titlebarOf(await findTitlebar(app));

  await expect.poll(() => background(ownTitlebar)).toBe("rgb(235, 235, 235)");
  expect(
    await titlebarOf(shell).evaluate((element) => {
      const probe = document.createElement("span");

      probe.style.color = "var(--muted-foreground)";
      element.append(probe);

      const { color } = getComputedStyle(probe);

      probe.remove();

      return color;
    })
  ).toBe("rgb(85, 85, 85)");
  expect(await fills(await openDownloads(shell, overlay))).toContain(
    "oklch(1 0 0)"
  );
});

/** One profile of `color`, with the sidebar, Calendar and Drive. */
const oneProfile = (standIn: StandIn, color: ProfileColorName) => ({
  profiles: [
    {
      id: "p",
      name: "Default",
      color,
      tabs: [
        {
          id: "gmail",
          app: "gmail",
          url: standIn.url,
          title: "",
          pinned: true,
          openAtLaunch: true,
        },
        { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        { id: "d", app: "drive", url: standIn.driveUrl, title: "" },
      ],
      selectedTabId: "gmail",
    },
  ],
  selectedProfileId: "p",
});

const eachTheme = async (
  app: ElectronApplication,
  shoot: (theme: (typeof THEMES)[number]) => Promise<unknown>
) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one theme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one after another
    await shoot(theme);
  }
};

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  for (const color of PROFILE_COLOR_NAMES) {
    test(`the main window of a ${color} profile, light and dark`, async ({
      launchApp,
      standIn,
      userDataDir,
    }) => {
      await writeState(userDataDir, oneProfile(standIn, color));

      const app = await launchApp();
      const shell = await findPage(app, SHELL_URL);

      await findPage(app, standIn.url);
      await expect(shell.getByRole("tablist", { name: "Tabs" })).toBeVisible();
      await shell.mouse.move(700, 20);
      await eachTheme(app, (theme) =>
        shootWindow(app, shell, shotPath(`tonal-${color}`, theme))
      );
    });
  }

  test("the main window untinted, light and dark", async ({
    launchApp,
    standIn,
    userDataDir,
  }) => {
    await writeSettings(userDataDir, { profileTint: false });
    await writeState(userDataDir, oneProfile(standIn, "blue"));

    const app = await launchApp();
    const shell = await findPage(app, SHELL_URL);

    await findPage(app, standIn.url);
    await expect(shell.getByRole("tablist", { name: "Tabs" })).toBeVisible();
    await shell.mouse.move(700, 20);
    await eachTheme(app, (theme) =>
      shootWindow(app, shell, shotPath("tonal-untinted", theme))
    );
  });

  for (const color of ["blue", "amber"] as const) {
    test(`the ${color} profile's New tab menu, toast, Downloads card and own window, light and dark`, async ({
      launchApp,
      standIn,
      userDataDir,
    }) => {
      const folder = path.join(userDataDir, "Downloads");
      const state = oneProfile(standIn, color);
      const [profile] = state.profiles;

      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, "minutes.pdf"), Buffer.alloc(2048, 1));
      await writeState(userDataDir, {
        ...state,
        profiles: [
          {
            ...profile,
            tabs: profile?.tabs.map((tab) =>
              tab.id === "d"
                ? {
                    ...tab,
                    ownWindow: true,
                    windowBounds: { x: 120, y: 120, width: 900, height: 600 },
                  }
                : tab
            ),
          },
        ],
        downloads: [
          {
            id: "d0",
            fileName: "minutes.pdf",
            path: path.join(folder, "minutes.pdf"),
            size: 2048,
            startedAt: Date.now() - 5 * 60_000,
            state: "completed",
          },
        ],
      });

      const app = await launchApp();
      const shell = await findPage(app, SHELL_URL);
      const overlay = await findOverlayDocument(app);

      await findPage(app, standIn.url);
      await shell.mouse.move(700, 20);

      await app.evaluate(({ Menu, BrowserWindow }) => {
        Menu.getApplicationMenu()
          ?.getMenuItemById("app.open")
          ?.click(undefined, BrowserWindow.getAllWindows()[0]);
      });
      await expect(
        overlay.getByRole("combobox", { name: "New tab" })
      ).toBeFocused();
      await eachTheme(app, (theme) =>
        shootWindow(app, shell, shotPath(`tonal-${color}-new-tab`, theme))
      );
      await overlay.keyboard.press("Escape");
      await expect(
        overlay.getByRole("combobox", { name: "New tab" })
      ).toHaveCount(0);

      await openDownloads(shell, overlay);
      await shell.mouse.move(700, 20);
      await eachTheme(app, (theme) =>
        shootWindow(app, shell, shotPath(`tonal-${color}-downloads`, theme))
      );
      await overlay.keyboard.press("Escape");

      // A split refused in a small window says so in a toast.
      await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.setContentSize(720, 480);
      });
      await eachTheme(app, async (theme) => {
        await app.evaluate(({ Menu, BrowserWindow }) => {
          Menu.getApplicationMenu()
            ?.getMenuItemById("tab.splitDown")
            ?.click(undefined, BrowserWindow.getAllWindows()[0]);
        });

        const toast = overlay.getByText("Not enough room to split", {
          exact: true,
        });

        await expect(toast).toBeVisible();
        // Lets the toast slide in.
        await delay(600);
        await shootWindow(app, shell, shotPath(`tonal-${color}-toast`, theme));
        await expect(toast).toHaveCount(0, { timeout: 8000 });
      });

      const ownTitlebar = await findTitlebar(app);

      await expect
        .poll(async () => {
          const [window] = await readOwnWindows(app);

          return window?.views.filter((view) => view.visible).length;
        })
        .toBe(2);
      await ownTitlebar.mouse.move(600, 300);
      await eachTheme(app, (theme) =>
        shootOwnWindow(app, shell, shotPath(`tonal-${color}-own-window`, theme))
      );
    });
  }
});
