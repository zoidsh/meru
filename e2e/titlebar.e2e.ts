import type { Page } from "@playwright/test";

import type { Platform } from "#core/platform.ts";
import { sidebarWidth } from "#core/sidebar.ts";

import {
  clickMenuItem,
  expect,
  findPage,
  readViews,
  test,
  writeState,
} from "./lib/app.ts";

const titlebar = (shell: Page) =>
  shell.getByRole("banner", { name: "Title bar" });

/**
 * An element's background as drawn, red, green and blue: a computed
 * `color-mix` stays in its mixing space, so a canvas converts it.
 */
const drawnRgb = (element: Element) => {
  const context = document.createElement("canvas").getContext("2d");

  if (!context) {
    throw new Error("No 2D canvas");
  }

  context.fillStyle = getComputedStyle(element).backgroundColor;
  context.fillRect(0, 0, 1, 1);

  const [red = 0, green = 0, blue = 0] = context.getImageData(0, 0, 1, 1).data;

  return [red, green, blue] as const;
};

test("with two profiles the row's tab stop follows the selection once focus leaves it, a click selects the other and the shell takes its colour; Back and Forward follow the page's history, and Reload loads it again", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p0",
        name: "Home",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "c",
      },
      { id: "p1", name: "Work" },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const bar = titlebar(shell);
  const profile = (name: string) =>
    bar
      .getByRole("group", { name: "Profiles" })
      .getByRole("button", { name: new RegExp(`^${name}`, "u") });
  const back = bar.getByRole("button", { name: "Back" });
  const forward = bar.getByRole("button", { name: "Forward" });
  // Named Stop while the page loads.
  const reload = bar.getByRole("button", { name: "Reload" });
  const calendar = await findPage(app, standIn.calendarUrl);

  await expect(reload).toBeEnabled();
  await expect(back).toBeDisabled();
  await expect(forward).toBeDisabled();

  await calendar.getByRole("link", { name: "Next week" }).click();

  await expect(back).toBeEnabled();
  await expect(forward).toBeDisabled();

  await back.click();

  await expect(forward).toBeEnabled();
  await expect(back).toBeDisabled();
  await expect(reload).toBeEnabled();

  const before = standIn.requests().calendar;

  await reload.click();

  await expect.poll(() => standIn.requests().calendar).toBe(before + 1);
  await expect(reload).toBeEnabled();

  const shellColour = () =>
    bar.evaluate((element) => getComputedStyle(element).backgroundColor);
  const homeColour = await shellColour();

  await expect(profile("Home")).toHaveAttribute("aria-pressed", "true");

  // Home's colour is the palette's blue: its shell and its selected button
  // lean blue, not toward the hue a grey's oklch form names.
  const [shellRgb, selectedRgb] = await Promise.all([
    bar.evaluate(drawnRgb),
    profile("Home").evaluate(drawnRgb),
  ]);

  expect(shellRgb[2]).toBeGreaterThan(shellRgb[0]);
  expect(selectedRgb[2]).toBeGreaterThan(selectedRgb[0]);

  // An arrow moves the row's one tab stop; once focus leaves the row it goes
  // back to the selected profile.
  await profile("Home").focus();
  await shell.keyboard.press("ArrowRight");

  await expect(profile("Work")).toBeFocused();
  await expect(profile("Work")).toHaveAttribute("tabindex", "0");
  await expect(profile("Home")).toHaveAttribute("tabindex", "-1");

  await shell.keyboard.press("Shift+Tab");

  await expect(profile("Work")).not.toBeFocused();
  await expect(profile("Home")).toHaveAttribute("tabindex", "0");
  await expect(profile("Work")).toHaveAttribute("tabindex", "-1");
  await profile("Work").click();

  await expect(profile("Work")).toHaveAttribute("aria-pressed", "true");
  await expect(profile("Home")).toHaveAttribute("aria-pressed", "false");
  await expect.poll(shellColour).not.toBe(homeColour);
  // Work's Gmail page has no history yet.
  await expect(back).toBeDisabled();
});

/** A shortcut as the platform writes it: `mac` on macOS, `other` elsewhere. */
const keys = (mac: string, other: string) =>
  process.platform === "darwin" ? mac : other;

test("each control's title names it and its shortcut, a narrow tab's names the tab, and Chromium adds a title only where it says more than the name", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p0",
        name: "Home",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "gmail",
      },
      { id: "p1", name: "Work" },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const bar = titlebar(shell);
  const reload = bar.getByRole("button", { name: "Reload" });
  const reloadTitle = `Reload (${keys("⌘R", "Ctrl+R")})`;
  // Alt and the digit on Linux.
  const workKeys =
    { darwin: "⌘2", linux: "Alt+2" }[process.platform as string] ?? "Ctrl+2";

  await findPage(app, standIn.url);
  await expect(reload).toBeEnabled();
  await expect(reload).toHaveAttribute("title", reloadTitle);
  await expect(bar.getByRole("button", { name: "Sidebar" })).toHaveAttribute(
    "title",
    `Hide sidebar (${keys("⌃⌘L", "Ctrl+Alt+D")})`
  );
  // The stand-in signs in no session of Work's, so its title says so too.
  await expect(
    bar
      .getByRole("group", { name: "Profiles" })
      .getByRole("button", { name: /^Work/u })
  ).toHaveAttribute("title", `Work, sign in required (${workKeys})`);

  const calendar = shell
    .getByRole("tablist", { name: "Tabs" })
    .getByRole("tab")
    .nth(1);
  const calendarTitle = (await calendar.textContent()) ?? "";

  expect(calendarTitle).not.toBe("");
  // Never selected, so never loaded: asleep.
  await expect(calendar).toHaveAttribute("title", `${calendarTitle} · asleep`);

  // Chromium reads a title as the description unless the name came from
  // content with the same text; an aria-label equal to the title would have
  // it read twice, so such a button has the title alone.
  const session = await shell.context().newCDPSession(shell);
  const description = async (name: string) => {
    const { result } = await session.send("Runtime.evaluate", {
      expression: "document",
    });
    const { nodes } = await session.send("Accessibility.queryAXTree", {
      objectId: result.objectId ?? "",
      accessibleName: name,
      role: "button",
    });

    return nodes[0]?.description?.value ?? "";
  };

  await expect.poll(() => description("Reload")).toBe(reloadTitle);
  await expect.poll(() => description("Expand sidebar")).toBe("");

  await shell.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(
    shell.getByRole("button", { name: "Collapse sidebar" })
  ).toBeAttached();
  await expect(calendar).not.toHaveAttribute("title");
});

test("with the sidebar wide the first profile button starts where the page does; narrow and hidden, the profiles follow the page's navigation one gap after it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeState(userDataDir, {
    profiles: [
      {
        id: "p0",
        name: "Home",
        // A tab beside Gmail, so the sidebar shows.
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
        ],
        selectedTabId: "gmail",
      },
      { id: "p1", name: "Work" },
    ],
    selectedProfileId: "p0",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const bar = titlebar(shell);
  const first = bar
    .getByRole("group", { name: "Profiles" })
    .getByRole("button", { name: /^Home/u });
  const reload = bar.getByRole("button", { name: "Reload" });
  const narrow = shell.getByRole("button", { name: "Collapse sidebar" });
  const pageLeft = async () => {
    const { views } = await readViews(app);

    return views.find((view) => view.visible)?.bounds.x;
  };
  const profilesLeft = async () => {
    const box = await first.boundingBox();

    return box?.x;
  };
  // From the navigation's last button to the first profile.
  const afterNavigation = async () => {
    const button = await reload.boundingBox();
    const profile = await first.boundingBox();

    return (profile?.x ?? 0) - (button?.x ?? 0) - (button?.width ?? 0);
  };

  await findPage(app, standIn.url);

  if ((await narrow.count()) === 0) {
    await shell.getByRole("button", { name: "Expand sidebar" }).click();
  }

  await expect.poll(pageLeft).toBe(224);
  await expect.poll(profilesLeft).toBe(224);

  await narrow.click();
  await expect
    .poll(pageLeft)
    .toBe(sidebarWidth("narrow", process.platform as Platform));
  await expect.poll(afterNavigation).toBe(8);

  await clickMenuItem(app, "sidebar.toggle");
  await expect.poll(pageLeft).toBe(8);
  await expect.poll(afterNavigation).toBe(8);
});

/** The main window's minimum, outer size. */
const SMALLEST = [540, 375];

/** The band over a clipped end of the profile row that its arrow and fade cover. */
const FADE = 40;

test("at its smallest, with the sidebar hidden and two profiles, every titlebar button is in the window and either profile, selected, shows whole clear of the arrows", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  await writeState(userDataDir, {
    profiles: ["Home", "Work"].map((name) => ({
      id: name.toLowerCase(),
      name,
      tabs: [
        { id: `${name}-gmail`, app: "gmail", url: standIn.url, title: "" },
      ],
      selectedTabId: `${name}-gmail`,
    })),
    selectedProfileId: "work",
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const bar = titlebar(shell);
  const row = bar.getByRole("group", { name: "Profiles" });

  await findPage(app, standIn.url);
  await expect(
    bar.getByRole("button", { name: "New tab", exact: true })
  ).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1, 1);
  });
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getSize()
      )
    )
    .toStrictEqual(SMALLEST);

  const width = await shell.evaluate(() => window.innerWidth);

  for (const name of [
    "Sidebar",
    "Back",
    "Forward",
    "Reload",
    "New tab",
    "Unified inbox",
    "Downloads",
    "Do Not Disturb",
  ]) {
    // oxlint-disable-next-line no-await-in-loop -- one button at a time
    const box = await bar
      .getByRole("button", { name, exact: true })
      .boundingBox();

    expect(box ? box.x + box.width : Infinity, name).toBeLessThanOrEqual(width);
  }

  /** How much of the row's end on `side` an arrow covers, if one shows. */
  const arrow = async (side: string) =>
    (await bar
      .getByRole("button", { name: `Scroll profiles ${side}` })
      .count()) > 0
      ? FADE
      : 0;
  const clearOfArrows = async (name: string) => {
    const outer = await row.boundingBox();
    const inner = await row
      .getByRole("button", { name: new RegExp(`^${name}`, "u") })
      .boundingBox();
    const left = await arrow("left");
    const right = await arrow("right");

    // A button's width is fractional; the row's is whole.
    return (
      outer !== null &&
      inner !== null &&
      Math.round(inner.x) >= outer.x + left &&
      Math.round(inner.x + inner.width) <= outer.x + outer.width - right
    );
  };

  await expect.poll(() => clearOfArrows("Work")).toBe(true);
  await clickMenuItem(app, "profile.select.1");
  await expect.poll(() => clearOfArrows("Home")).toBe(true);
});
