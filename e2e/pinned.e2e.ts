import type { ElectronApplication, Page } from "@playwright/test";

import {
  clickMenuItem,
  expect,
  findPage,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  ANY_SESSION,
  CALENDAR_TITLE,
  DRIVE_TITLE,
  STAND_IN_TITLE,
} from "./lib/stand-in.ts";

/** Gmail, pinned, then Calendar and Drive, with Drive selected. */
const seed = (userDataDir: string, standIn: StandIn) =>
  writeState(userDataDir, {
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
          { id: "d", app: "drive", url: standIn.driveUrl, title: DRIVE_TITLE },
        ],
        selectedTabId: "d",
      },
    ],
    selectedProfileId: "p",
  });

const tabs = (shell: Page) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab");

const tab = (shell: Page, title: string) =>
  shell.getByRole("tablist", { name: "Tabs" }).getByRole("tab", {
    name: title,
    exact: true,
  });

const closeButton = (shell: Page, title: string) =>
  shell.getByRole("button", { name: `Close ${title}`, includeHidden: true });

/** A key as the system hands it to the page at `url`. */
const pressIn = (
  app: ElectronApplication,
  url: string,
  keyCode: string,
  modifiers: ("control" | "shift")[]
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) => candidate.getURL().startsWith(request.url));

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode: request.keyCode,
          modifiers: request.modifiers,
        });
      }
    },
    { url, keyCode, modifiers }
  );

test("Pin Tab moves the selected tab into the pinned area, after Gmail and with no close button, and Unpin Tab puts it back in the list in its place", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.driveUrl);
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);
  await expect(closeButton(shell, DRIVE_TITLE)).toHaveCount(1);

  await clickMenuItem(app, "tab.pin");

  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    DRIVE_TITLE,
    CALENDAR_TITLE,
  ]);
  await expect(closeButton(shell, DRIVE_TITLE)).toHaveCount(0);
  await expect(closeButton(shell, STAND_IN_TITLE)).toHaveCount(0);

  await clickMenuItem(app, "tab.pin");

  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    CALENDAR_TITLE,
    DRIVE_TITLE,
  ]);
  await expect(closeButton(shell, DRIVE_TITLE)).toHaveCount(1);
});

test("the arrow keys go from the pinned area into the list and back, and Delete does nothing on a pinned tab", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const gmail = tab(shell, "Gmail");

  await findPage(app, standIn.driveUrl);
  await tab(shell, DRIVE_TITLE).focus();
  await tab(shell, DRIVE_TITLE).press("Home");
  await expect(gmail).toBeFocused();
  await gmail.press("Delete");
  await expect(tabs(shell)).toHaveCount(3);
  await gmail.press("ArrowDown");
  await expect(tab(shell, CALENDAR_TITLE)).toBeFocused();
  await tab(shell, CALENDAR_TITLE).press("ArrowUp");
  await expect(gmail).toBeFocused();
});

test("Control+Shift and a digit in a page select the profile's pinned tab at that place, loading it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");

  await findPage(app, standIn.driveUrl);
  await clickMenuItem(app, "tab.pin");
  await expect(tabs(shell)).toHaveText([
    STAND_IN_TITLE,
    DRIVE_TITLE,
    CALENDAR_TITLE,
  ]);
  await tab(shell, CALENDAR_TITLE).click();
  await findPage(app, standIn.calendarUrl);

  await pressIn(app, standIn.calendarUrl, "2", ["control", "shift"]);
  await expect(tab(shell, DRIVE_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await pressIn(app, standIn.driveUrl, "1", ["control", "shift"]);
  await expect(tab(shell, STAND_IN_TITLE)).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await findPage(app, standIn.url);
});

test("Gmail's tile carries the unread count, and the sign-in mark in its place with the tooltip saying so while signed out", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await seed(userDataDir, standIn);

  const signedOut = await launchApp();
  const signedOutShell = await findPage(signedOut, "meru-app:");

  await expect(tab(signedOutShell, "Gmail")).toHaveAttribute(
    "title",
    "Gmail, sign in required"
  );
  await signedOut.close();

  standIn.setFeed(ANY_SESSION, { unreadCount: 3 });

  const signedIn = await launchApp();
  const shell = await findPage(signedIn, "meru-app:");

  await expect(tab(shell, "Gmail")).toHaveText(/3$/u);
  await expect(tab(shell, "Gmail")).toHaveAttribute("title", "Gmail");
});
