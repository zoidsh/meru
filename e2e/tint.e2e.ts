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
import {
  findTitlebar,
  findWindowCard,
  readOwnWindows,
} from "./lib/own-window.ts";
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
  page.evaluate(() => {
    const probe = document.createElement("span");

    probe.style.backgroundColor = "var(--background)";
    document.body.append(probe);

    const color = getComputedStyle(probe).backgroundColor;

    probe.remove();

    return color;
  });

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

/** Whether `page`'s root carries the tint: its mark and its role tokens. */
const tinted = (page: Page) =>
  page.evaluate(() => {
    const root = document.documentElement;

    return (
      root.dataset.tint !== undefined &&
      root.style.getPropertyValue("--shell") !== ""
    );
  });

test("a card in a tab's own window takes that tab's profile, and turning the tint off takes the palette from the overlay and every own window's document", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, twoProfiles(standIn));

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const overlay = await findOverlayDocument(app);
  const ownTitlebar = await findTitlebar(app);

  await titlebarOf(ownTitlebar)
    .getByRole("button", { name: "Downloads", exact: true })
    .click();

  const ownCard = await findWindowCard(app);
  const card = ownCard.getByRole("dialog", { name: "Downloads" });

  await expect(card).toBeVisible();
  // Home's blue, though Work, amber, is the selected profile.
  expect(await fills(card)).toContain(tone("blue", "light", "popover"));

  const documents = [shell, overlay, ownTitlebar, ownCard];
  const allTinted = () => Promise.all(documents.map((page) => tinted(page)));

  expect(await allTinted()).toStrictEqual([true, true, true, true]);

  await app.evaluate(async () => {
    const settings = Reflect.get(globalThis, "meruTestSettings") as {
      set: (key: string, value: unknown) => Promise<void>;
    };

    await settings.set("profileTint", false);
  });
  await expect.poll(allTinted).toStrictEqual([false, false, false, false]);
  expect(await fills(card)).toContain("oklch(1 0 0)");
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

/**
 * Starts keeping the colour near the top of every frame the main window's page
 * paints, its titlebar's, in `[red, green, blue]`.
 */
const watchPaints = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }, shellUrl) => {
    const painted: number[][] = [];
    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().startsWith(shellUrl)
    );

    window?.webContents.beginFrameSubscription((image) => {
      const { width, height } = image.getSize();
      const [contentWidth = width] = window.getContentSize();
      const at =
        (Math.round((3 * width) / contentWidth) * width +
          Math.round(width / 2)) *
        4;

      if (height > 0) {
        // BGRA.
        painted.push([...image.toBitmap().subarray(at, at + 3)].toReversed());
      }
    });
    Reflect.set(globalThis, "meruTestPainted", painted);
  }, SHELL_URL);

const readPaints = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestPainted") as number[][]);

/** Each window's own colour; a tab's own window is a BaseWindow. */
const windowColors = (app: ElectronApplication) =>
  app.evaluate(({ BaseWindow, BrowserWindow }, shellUrl) => {
    const shell = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().startsWith(shellUrl)
    );
    const [main, ...own] = [
      ...(shell ? [shell] : []),
      ...BaseWindow.getAllWindows().filter((window) => window.id !== shell?.id),
    ].map((window) => window.getBackgroundColor().slice(0, 7).toLowerCase());

    return { main, own };
  }, SHELL_URL);

const shellTone = (name: ProfileColorName, theme: TonalTheme) =>
  tonalTokens(paletteColor(name), theme).shell;

const near = (rgb: number[], hex: string, dim = 1) =>
  rgb.every(
    (channel, index) =>
      Math.abs(
        channel -
          Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) * dim
      ) <= 3
  );

/**
 * Whether every frame is `hex`, or the same darkened by the veil Chromium
 * draws while Playwright holds a new page at its first line, which no one
 * outside a test ever sees.
 */
const allPainted = (frames: number[][], hex: string) =>
  frames.some((top) => near(top, hex)) &&
  frames.every((top) => near(top, hex) || near(top, hex, 0.65));

for (const tint of [true, false]) {
  test(`every frame the shell's page paints while it loads in a window already showing is the frame's colour, ${tint ? "the profile's tonal shell" : "the grey untinted"}, never a white page first; each window is that colour too`, async ({
    launchApp,
    standIn,
    userDataDir,
  }) => {
    // Main's theme and the pages' the same, as Playwright emulates light.
    await writeSettings(userDataDir, { theme: "light", profileTint: tint });
    await writeState(userDataDir, twoProfiles(standIn));

    const app = await launchApp();
    const [main, own] = tint
      ? [shellTone("amber", "light"), shellTone("blue", "light")]
      : ["#ebebeb", "#ebebeb"];

    const shell = await findPage(app, SHELL_URL);

    await expect(titlebarOf(shell)).toBeVisible();
    await findTitlebar(app);
    expect(await windowColors(app)).toStrictEqual({ main, own: [own] });

    // A launch's first paints race Playwright's attaching, which Linux's
    // window, shown as soon as it is made, often loses. Loading the page
    // again, as main does when its renderer is gone, is the same load from an
    // empty page, with the window showing throughout.
    await watchPaints(app);

    const loaded = shell.waitForEvent("load");
    const before = await app.evaluate(({ BrowserWindow }, shellUrl) => {
      BrowserWindow.getAllWindows()
        .find((window) => window.webContents.getURL().startsWith(shellUrl))
        ?.webContents.reload();

      return (Reflect.get(globalThis, "meruTestPainted") as unknown[]).length;
    }, SHELL_URL);

    await loaded;
    await expect(titlebarOf(shell)).toBeVisible();
    // The own window's titlebar comes back too, reported before the app closes.
    await findTitlebar(app);
    // Frames go on arriving; a few after the titlebar shows are enough.
    await delay(500);

    const all = await readPaints(app);
    const painted = all.slice(before);

    expect(allPainted(painted, main), JSON.stringify(painted)).toBe(true);
  });
}

test("each window's own colour follows the selected profile, the theme and the setting", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeSettings(userDataDir, { theme: "light" });
  await writeState(userDataDir, twoProfiles(standIn));

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);

  await findTitlebar(app);

  const set = (key: string, value: unknown) =>
    app.evaluate(
      async (_electron, [name, to]) => {
        const settings = Reflect.get(globalThis, "meruTestSettings") as {
          set: (key: string, value: unknown) => Promise<void>;
        };

        await settings.set(name as string, to);
      },
      [key, value]
    );
  const colors = () => windowColors(app);

  await expect.poll(colors).toStrictEqual({
    main: shellTone("amber", "light"),
    own: [shellTone("blue", "light")],
  });

  await titlebarOf(shell)
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: /^Home/u })
    .click();
  await expect.poll(colors).toStrictEqual({
    main: shellTone("blue", "light"),
    own: [shellTone("blue", "light")],
  });

  await set("theme", "dark");
  await expect.poll(colors).toStrictEqual({
    main: shellTone("blue", "dark"),
    own: [shellTone("blue", "dark")],
  });

  await set("profileTint", false);
  await expect
    .poll(colors)
    .toStrictEqual({ main: "#1d1d1d", own: ["#1d1d1d"] });
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
