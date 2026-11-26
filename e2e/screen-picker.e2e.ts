import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import type { CapturedScreenSources } from "#platform/screen-sources.ts";

import {
  SHELL_URL,
  expect,
  findOverlayDocument,
  findPage,
  test,
  writeState,
} from "./lib/app.ts";
import {
  findTitlebar,
  findWindowCard,
  windowCardOpen,
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

/** Gmail, and a Meet tab, selected unless `ownWindow` moves it to a window of its own. */
const seed = (userDataDir: string, standIn: StandIn, ownWindow = false) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          {
            id: "meet",
            app: "meet",
            url: standIn.meetUrl,
            title: "",
            ...(ownWindow && { ownWindow: true }),
          },
        ],
        selectedTabId: ownWindow ? "gmail" : "meet",
      },
    ],
    selectedProfileId: "p",
  });

const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn,
  { ownWindow = false } = {}
) => {
  await seed(userDataDir, standIn, ownWindow);

  const app = await launchApp();
  const shell = await findPage(app, SHELL_URL);
  const meet = await findPage(app, standIn.meetUrl);
  // A request before the overlay's document is there is refused.
  const overlay = await findOverlayDocument(app);

  return { app, shell, meet, overlay };
};

/** Changes what the stand-in lists and says, before the next request. */
const setSources = (
  app: ElectronApplication,
  change: Partial<CapturedScreenSources>
) =>
  app.evaluate((_, next) => {
    Object.assign(
      Reflect.get(globalThis, "meruTestScreenSources") as object,
      next
    );
  }, change);

const readSources = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      Reflect.get(globalThis, "meruTestScreenSources") as CapturedScreenSources
  );

const present = async (meet: Page) => {
  await meet.getByRole("button", { name: "Present now" }).click();
  await expect(meet.getByText("Asking")).toBeVisible();
};

const sharing = (meet: Page) => meet.getByRole("status");

/**
 * Lets `document.hasFocus()` in the page say whether it holds Chromium's
 * keyboard focus, which Playwright otherwise makes every page claim.
 */
const followRealFocus = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });

  return () => page.evaluate(() => document.hasFocus());
};

const picker = (document: Page) =>
  document.getByRole("dialog", { name: "Choose what to share" });

test("shares a window chosen over a Meet tab in the main window, video alone, Windows first, then Screens", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, meet } = await launch(launchApp, userDataDir, standIn);

  await present(meet);

  const overlay = await findOverlayDocument(app);
  const card = picker(overlay);

  await expect(card).toBeVisible();

  const tabs = card.getByRole("tab");

  await expect(tabs).toHaveText(["Windows", "Screens"]);
  await expect(card.getByRole("tab", { name: "Windows" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(card.getByRole("tab", { name: "Windows" })).toBeFocused();

  const share = card.getByRole("button", { name: "Share" });

  await expect(share).toBeDisabled();
  await expect(card.getByRole("radio")).toHaveCount(3);
  await expect(card.getByRole("radio", { name: "Notes" })).toBeVisible();

  await card.getByRole("tab", { name: "Screens" }).click();
  await expect(card.getByRole("radio")).toHaveCount(2);
  await expect(
    card.getByRole("radio", { name: "Entire Screen" })
  ).toBeVisible();
  await card.getByRole("tab", { name: "Windows" }).click();

  // The keys: into the grid, then along it, each choice announced as checked.
  await overlay.keyboard.press("Tab");
  await expect(card.getByRole("tabpanel", { name: "Windows" })).toBeFocused();
  await overlay.keyboard.press("Tab");
  await expect(card.getByRole("radio", { name: "Notes" })).toBeFocused();
  await overlay.keyboard.press("ArrowRight");

  const slides = card.getByRole("radio", { name: "Slides for Monday" });

  await expect(slides).toBeFocused();
  await expect(slides).toBeChecked();
  await expect(share).toBeEnabled();
  await share.click();

  await expect(card).toBeHidden();
  await expect(sharing(meet)).toHaveText("Sharing 1 video, 0 audio");
  const { shared } = await readSources(app);

  expect(shared).toStrictEqual([
    { id: "window:102:0", name: "Slides for Monday" },
  ]);
});

test("Enter on a source, reached by the keys alone or chosen, and a double-click, share it", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, meet } = await launch(launchApp, userDataDir, standIn);

  await present(meet);

  const overlay = await findOverlayDocument(app);
  const card = picker(overlay);

  // Tab lands on the first source without choosing it; Enter shares it all the same.
  await expect(card.getByRole("tab", { name: "Windows" })).toBeFocused();
  await overlay.keyboard.press("Tab");
  await overlay.keyboard.press("Tab");
  await expect(card.getByRole("radio", { name: "Notes" })).toBeFocused();
  await expect(card.getByRole("radio", { name: "Notes" })).not.toBeChecked();
  await overlay.keyboard.press("Enter");
  await expect(sharing(meet)).toHaveText("Sharing 1 video, 0 audio");

  await present(meet);
  await card.getByRole("radio", { name: "Terminal" }).click();
  await overlay.keyboard.press("Enter");
  await expect(sharing(meet)).toHaveText("Sharing 1 video, 0 audio");

  await present(meet);
  await card.getByRole("tab", { name: "Screens" }).click();
  await card.getByText("Screen 2").dblclick();
  await expect(sharing(meet)).toHaveText("Sharing 1 video, 0 audio");
  const { shared } = await readSources(app);

  expect(shared).toStrictEqual([
    { id: "window:101:0", name: "Notes" },
    { id: "window:103:0", name: "Terminal" },
    { id: "screen:2:0", name: "Screen 2" },
  ]);
});

test("Cancel, Escape and a press outside the card share nothing, and give the keys back to the page", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, meet } = await launch(launchApp, userDataDir, standIn);
  const overlay = await findOverlayDocument(app);
  const card = picker(overlay);
  const meetFocused = await followRealFocus(meet);
  const overlayFocused = await followRealFocus(overlay);
  const dismissals: (() => Promise<void>)[] = [
    () => card.getByRole("button", { name: "Cancel" }).click(),
    () => overlay.keyboard.press("Escape"),
    async () => {
      await overlay.mouse.click(4, 4);
    },
  ];

  for (const dismiss of dismissals) {
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await present(meet);
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect(card.getByRole("radio", { name: "Notes" })).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect.poll(overlayFocused).toBe(true);
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await dismiss();
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect(sharing(meet)).toHaveText("Not shared: AbortError");
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect(card).toBeHidden();
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect.poll(meetFocused).toBe(true);
  }

  const { shared } = await readSources(app);

  expect(shared).toStrictEqual([]);
});

test("shows a skeleton while listing, says so when a tab has nothing, and offers Try again when listing fails", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, meet } = await launch(launchApp, userDataDir, standIn);
  const overlay = await findOverlayDocument(app);
  const card = picker(overlay);

  await setSources(app, { windows: [] });
  await present(meet);
  await expect(card.getByText("No windows to share.")).toBeVisible();
  await card.getByRole("tab", { name: "Screens" }).click();
  await expect(card.getByRole("radio")).toHaveCount(2);
  await card.getByRole("button", { name: "Cancel" }).click();

  await setSources(app, { screens: [], fails: true });
  await present(meet);
  await expect(
    card.getByText("Couldn't list your screens and windows.")
  ).toBeVisible();
  await setSources(app, { fails: false });
  await card.getByRole("button", { name: "Try again" }).click();
  await expect(card.getByText("No windows to share.")).toBeVisible();
  await card.getByRole("tab", { name: "Screens" }).click();
  await expect(card.getByText("No screens to share.")).toBeVisible();
  await overlay.keyboard.press("Escape");
  await expect(sharing(meet)).toHaveText("Not shared: AbortError");
});

test("says in a toast that a window closed before Share, sharing nothing", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, meet } = await launch(launchApp, userDataDir, standIn);
  const overlay = await findOverlayDocument(app);
  const card = picker(overlay);

  await present(meet);
  await card.getByRole("radio", { name: "Notes" }).click();
  await setSources(app, { gone: ["window:101:0"] });
  await card.getByRole("button", { name: "Share" }).click();
  await expect(
    overlay.getByText("That window is no longer open.")
  ).toBeVisible();
  await expect(sharing(meet)).toHaveText("Not shared: AbortError");
});

test("answers with no stream as the Meet page navigates away", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, meet } = await launch(launchApp, userDataDir, standIn);
  const overlay = await findOverlayDocument(app);
  const card = picker(overlay);

  await present(meet);
  await expect(card).toBeVisible();
  await meet.evaluate(() => {
    location.assign("/next");
  });
  await expect(card).toBeHidden();
});

test("shows the picker in a Meet tab's own window, in the slot the Downloads card uses, and shares from there", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, meet } = await launch(launchApp, userDataDir, standIn, {
    ownWindow: true,
  });
  const titlebar = await findTitlebar(app);

  await present(meet);

  const document = await findWindowCard(app);
  const card = picker(document);

  await expect(card).toBeVisible();
  await expect(card.getByRole("tab", { name: "Windows" })).toBeFocused();
  await card.getByRole("radio", { name: "Notes" }).click();
  await card.getByRole("button", { name: "Share" }).click();
  await expect(sharing(meet)).toHaveText("Sharing 1 video, 0 audio");
  await expect.poll(() => windowCardOpen(app)).toBe(false);
  // Each opening of the card is a document of its own, and the last one's
  // can still be listed while it closes.
  await expect.poll(() => document.isClosed()).toBe(true);

  // Escape, a press beside it and one on the titlebar each share nothing.
  // The card's document goes on the key or button going down, so a release
  // would be sent to a closed page.
  for (const dismiss of [
    (shown: Page) => shown.keyboard.down("Escape"),
    async (shown: Page) => {
      await shown.mouse.move(4, 4);
      await shown.mouse.down();
    },
    () => titlebar.getByText("Meet stand-in").click(),
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await present(meet);
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    const shown = await findWindowCard(app);

    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect(
      picker(shown).getByRole("radio", { name: "Notes" })
    ).toBeVisible();
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await dismiss(shown);
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect(sharing(meet)).toHaveText("Not shared: AbortError");
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect.poll(() => windowCardOpen(app)).toBe(false);
    // oxlint-disable-next-line no-await-in-loop -- one request at a time
    await expect.poll(() => shown.isClosed()).toBe(true);
  }

  // Opening Downloads there takes the slot, sharing nothing.
  await present(meet);
  const shown = await findWindowCard(app);

  await expect(picker(shown)).toBeVisible();
  await titlebar.getByRole("button", { name: "Downloads" }).click();
  await expect(sharing(meet)).toHaveText("Not shared: AbortError");
  await expect.poll(() => shown.isClosed()).toBe(true);

  const downloads = await findWindowCard(app);

  await expect(
    downloads.getByRole("dialog", { name: "Downloads" })
  ).toBeVisible();
});

test("on macOS, says Meru needs permission without listing, and Open System Settings reaches the stand-in", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  test.skip(process.platform !== "darwin", "macOS alone asks for permission");

  const { app, meet } = await launch(launchApp, userDataDir, standIn);
  const overlay = await findOverlayDocument(app);
  const card = picker(overlay);

  await setSources(app, { status: "denied" });
  await present(meet);
  await expect(
    card.getByText("Meru needs permission to record your screen.")
  ).toBeVisible();
  await card.getByRole("button", { name: "Open System Settings" }).click();
  await expect
    .poll(async () => {
      const { settingsOpened } = await readSources(app);

      return settingsOpened;
    })
    .toBe(1);
  const { listed } = await readSources(app);

  expect(listed).toBe(0);
  await card.getByRole("button", { name: "Cancel" }).click();
  await expect(sharing(meet)).toHaveText("Not shared: AbortError");
});

/** Away from every source, so none shows its hover. */
const restPointer = async (document: Page) => {
  await document.mouse.move(4, 4);
  // The hover's end is painted a frame or two later, after the window shot would be taken.
  await delay(200);
};

const shootEachWay = async (
  app: ElectronApplication,
  shoot: (theme: (typeof THEMES)[number]) => Promise<void>
) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shoot(theme);
  }
};

test("draws the picker's windows, screens and, on macOS, permission states in the main window, light and dark", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  onlyWithShots();

  const { app, shell, meet, overlay } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const card = picker(overlay);

  await present(meet);
  await card.getByRole("radio", { name: "Slides for Monday" }).click();
  await restPointer(overlay);
  await shootEachWay(app, (theme) =>
    shootWindow(app, shell, shotPath("screen-picker-windows", theme))
  );

  await card.getByRole("tab", { name: "Screens" }).click();
  await expect(card.getByRole("radio")).toHaveCount(2);
  await restPointer(overlay);
  await shootEachWay(app, (theme) =>
    shootWindow(app, shell, shotPath("screen-picker-screens", theme))
  );
  await card.getByRole("button", { name: "Cancel" }).click();

  if (process.platform === "darwin") {
    await setSources(app, { status: "denied" });
    await present(meet);
    await expect(
      card.getByText("Meru needs permission to record your screen.")
    ).toBeVisible();
    await shootEachWay(app, (theme) =>
      shootWindow(app, shell, shotPath("screen-picker-denied", theme))
    );
  }
});

test("draws the picker in a tab's own window, light and dark", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  onlyWithShots();

  const { app, shell, meet } = await launch(launchApp, userDataDir, standIn, {
    ownWindow: true,
  });

  await present(meet);

  const document = await findWindowCard(app);

  await picker(document).getByRole("radio", { name: "Notes" }).click();
  await restPointer(document);
  await shootEachWay(app, (theme) =>
    shootOwnWindow(app, shell, shotPath("screen-picker-own-window", theme))
  );
});
