import type { ElectronApplication, Page } from "@playwright/test";
import { delay } from "es-toolkit";

import { FIND_BAR, FIND_INSET } from "#core/find.ts";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuItem,
  readViews,
  sizeWindow,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  CALENDAR_TITLE,
  DRIVE_TITLE,
  FIND_MATCHES,
  FIND_WORD,
  NEXT_WEEK_PATH,
  THREAD_PATH,
} from "./lib/stand-in.ts";

const isMacOS = process.platform === "darwin";

/** Gmail, Calendar, selected, and Drive, with `fields` added to the profile. */
const seed = (userDataDir: string, standIn: StandIn, fields: object = {}) =>
  writeState(userDataDir, {
    profiles: [
      {
        id: "p",
        name: "Default",
        tabs: [
          { id: "gmail", app: "gmail", url: standIn.url, title: "" },
          { id: "c", app: "calendar", url: standIn.calendarUrl, title: "" },
          { id: "d", app: "drive", url: standIn.driveUrl, title: "" },
        ],
        selectedTabId: "c",
        ...fields,
      },
    ],
    selectedProfileId: "p",
  });

/**
 * Lets `document.hasFocus()` in the page say whether it holds Chromium's
 * keyboard focus, which Playwright otherwise makes every page claim.
 */
const followRealFocus = async (page: Page) => {
  const cdp = await page.context().newCDPSession(page);

  await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: false });

  return () => page.evaluate(() => document.hasFocus());
};

/**
 * Cmd or Ctrl with `keyCode`, and Shift with `shift`, in the page whose URL
 * starts with `target`, or the overlay's view, as the system hands keys to it, so its view hears them first; `plain` leaves
 * out Cmd or Ctrl.
 */
const press = (
  app: ElectronApplication,
  target: string,
  keyCode: string,
  { shift = false, plain = false } = {}
) =>
  app.evaluate(
    ({ webContents }, request) => {
      const page = webContents
        .getAllWebContents()
        .find((candidate) =>
          request.target === "overlay"
            ? candidate.mainFrame.name === "meru-overlay"
            : candidate.getURL().startsWith(request.target)
        );

      for (const type of ["keyDown", "keyUp"] as const) {
        page?.sendInputEvent({
          type,
          keyCode: request.keyCode,
          modifiers: request.modifiers,
        });
      }
    },
    {
      target,
      keyCode,
      modifiers: [
        ...(plain ? [] : [isMacOS ? ("meta" as const) : ("control" as const)]),
        ...(shift ? (["shift"] as const) : []),
      ],
    }
  );

/** The zoom level of the page whose URL starts with `target`, or the overlay's view. */
const zoomOf = (app: ElectronApplication, target: string) =>
  app.evaluate(
    ({ webContents }, wanted) =>
      webContents
        .getAllWebContents()
        .find((candidate) =>
          wanted === "overlay"
            ? candidate.mainFrame.name === "meru-overlay"
            : candidate.getURL().startsWith(wanted)
        )
        ?.getZoomLevel(),
    target
  );

/** Where the overlay's view sits and whether it shows. */
const readOverlayView = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const children = BrowserWindow.getAllWindows()[0]?.contentView.children;
    const view = children?.find(
      (candidate) =>
        (candidate as Electron.WebContentsView).webContents?.mainFrame.name ===
        "meru-overlay"
    );

    return { visible: view?.getVisible(), bounds: view?.getBounds() };
  });

/** The view's right edge and top. */
const topRight = (bounds: Electron.Rectangle | undefined) =>
  bounds && { right: bounds.x + bounds.width, top: bounds.y };

const barCorner = async (app: ElectronApplication) => {
  const { bounds } = await readOverlayView(app);

  return topRight(bounds);
};

const pageBounds = async (app: ElectronApplication, url: string) => {
  const { views } = await readViews(app);

  return views.find((view) => view.url.startsWith(url))?.bounds;
};

/** Where the bar's view goes: `FIND_INSET` in from its page's top right. */
const pageCorner = async (app: ElectronApplication, url: string) => {
  const corner = topRight(await pageBounds(app, url));

  return (
    corner && { right: corner.right - FIND_INSET, top: corner.top + FIND_INSET }
  );
};

/** Whether the bar's corner is where it goes, give or take its pane's focus ring. */
const near = (
  corner: ReturnType<typeof topRight>,
  page: ReturnType<typeof topRight>
) =>
  corner !== undefined &&
  page !== undefined &&
  Math.abs(corner.right - page.right) <= 4 &&
  Math.abs(corner.top - page.top) <= 4;

const within = (
  point: { x: number; y: number },
  bounds: Electron.Rectangle | undefined
) =>
  bounds !== undefined &&
  point.x >= bounds.x &&
  point.x < bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y < bounds.y + bounds.height;

const barShown = async (app: ElectronApplication) => {
  const { visible } = await readOverlayView(app);

  return visible;
};

const findOffered = async (app: ElectronApplication) => {
  const { enabled } = await readMenuItem(app, "tab.find");

  return enabled;
};

const parts = (overlay: Page) => {
  const bar = overlay.getByRole("search", { name: "Find in page" });

  return {
    bar,
    field: bar.getByRole("textbox", { name: "Find in page" }),
    count: bar.getByText(/^\d+\/\d+$/u),
    previous: bar.getByRole("button", { name: "Previous match" }),
    next: bar.getByRole("button", { name: "Next match" }),
    close: bar.getByRole("button", { name: "Close" }),
  };
};

const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn,
  fields: object = {}
) => {
  await seed(userDataDir, standIn, fields);

  const app = await launchApp();

  await findPage(app, "meru-app:");
  await sizeWindow(app, 1000, 700);

  const calendar = await findPage(app, standIn.calendarUrl);
  const overlay = await findOverlayDocument(app);

  return { app, calendar, overlay, ...parts(overlay) };
};

const SPLIT = {
  splits: [
    {
      root: {
        direction: "row",
        children: [
          { size: 0.5, pane: "c" },
          { size: 0.5, pane: "d" },
        ],
      },
    },
  ],
};

test("Cmd or Ctrl+F opens the bar, its view exactly the bar's size, at the page's top right with its field focused; typing counts the matches, Enter and Shift+Enter step and wrap, an emptied field shows 0/0, and Escape closes it with focus back on the page", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, calendar, bar, field, count, previous, next } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const calendarHasFocus = await followRealFocus(calendar);

  await expect.poll(calendarHasFocus).toBeTruthy();
  await press(app, standIn.calendarUrl, "F");
  await expect(field).toBeFocused();
  expect(await barCorner(app)).toStrictEqual(
    await pageCorner(app, standIn.calendarUrl)
  );
  await expect(count).toHaveText("0/0");
  await expect(next).toBeDisabled();

  // Nothing beside the bar is the overlay's: a click there is the page's.
  const { bounds } = await readOverlayView(app);
  const beside = bounds && { x: bounds.x - 4, y: bounds.y + bounds.height / 2 };

  expect([
    bounds?.width,
    bounds?.height,
    await bar.boundingBox(),
  ]).toStrictEqual([
    FIND_BAR.width,
    FIND_BAR.height,
    { x: 0, y: 0, ...FIND_BAR },
  ]);
  expect(beside && within(beside, bounds)).toBe(false);
  expect(
    beside && within(beside, await pageBounds(app, standIn.calendarUrl))
  ).toBe(true);

  await field.pressSequentially(FIND_WORD);
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);

  for (const ordinal of [2, 3, 1]) {
    // oxlint-disable-next-line no-await-in-loop -- one step at a time
    await field.press("Enter");
    // oxlint-disable-next-line no-await-in-loop -- one step at a time
    await expect(count).toHaveText(`${ordinal}/${FIND_MATCHES}`);
  }

  await field.press("Shift+Enter");
  await expect(count).toHaveText(`${FIND_MATCHES}/${FIND_MATCHES}`);
  await previous.click();
  await expect(count).toHaveText(`2/${FIND_MATCHES}`);
  // A button gives the field its focus back, to go on typing.
  await expect(field).toBeFocused();

  // Cmd or Ctrl+G in the field steps once, the overlay's view hearing it
  // before the menu could.
  await press(app, "overlay", "G");
  await expect(count).toHaveText(`3/${FIND_MATCHES}`);
  await delay(300);
  await expect(count).toHaveText(`3/${FIND_MATCHES}`);

  await field.fill("");
  await expect(count).toHaveText("0/0");
  await field.pressSequentially("nowhere in it");
  await expect(count).toHaveText("0/0");

  await press(app, "overlay", "Escape", { plain: true });
  await expect(bar).toHaveCount(0);
  expect(await barShown(app)).toBeFalsy();
  await expect.poll(calendarHasFocus).toBeTruthy();
});

test("Find in the Edit menu opens the bar; a click in the page keeps it, Cmd or Ctrl+G and Shift with it step from the page, Find again puts the caret after the term, and once closed, Cmd or Ctrl+G opens it with the term remembered and goes on; a load searches again", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, calendar, bar, field, count, close } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const calendarHasFocus = await followRealFocus(calendar);
  const unremembered = await readMenuItem(app, "tab.findNext");

  await clickMenuItem(app, "tab.find");
  await expect(field).toBeFocused();
  await field.pressSequentially(FIND_WORD);
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);

  await calendar.getByRole("heading", { name: CALENDAR_TITLE }).click();
  await expect.poll(calendarHasFocus).toBeTruthy();
  await expect(bar).toBeVisible();
  // Chromium goes on from the click, above every match, so back wraps to
  // the last.
  await press(app, standIn.calendarUrl, "G", { shift: true });
  await expect(count).toHaveText(`${FIND_MATCHES}/${FIND_MATCHES}`);
  await press(app, standIn.calendarUrl, "G");
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);

  await press(app, standIn.calendarUrl, "F");
  await expect(field).toBeFocused();
  expect(
    await field.evaluate((input: HTMLInputElement) => [
      input.selectionStart,
      input.selectionEnd,
    ])
  ).toStrictEqual([FIND_WORD.length, FIND_WORD.length]);

  await close.click();
  await expect(bar).toHaveCount(0);
  await expect.poll(calendarHasFocus).toBeTruthy();

  await press(app, standIn.calendarUrl, "G");
  await expect(field).toHaveValue(FIND_WORD);
  await expect(count).toHaveText(new RegExp(`^[1-9]/${FIND_MATCHES}$`, "u"));

  // A word the page that loads next lacks.
  await calendar.evaluate(() => {
    document.body.insertAdjacentHTML("beforeend", "<p>Retrospective</p>");
  });
  await field.fill("retrospective");
  await expect(count).toHaveText("1/1");
  await calendar.getByRole("link", { name: "Next week" }).click();
  await expect.poll(() => calendar.url()).toContain(NEXT_WEEK_PATH);
  await expect(count).toHaveText("0/0");
  await expect(bar).toBeVisible();
  expect(unremembered.enabled).toBe(false);
});

test("a move within the page, as Gmail opens a thread, searches again, and a frame loading into the page leaves the match where it is", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, calendar, field, count } = await launch(
    launchApp,
    userDataDir,
    standIn
  );

  await press(app, standIn.calendarUrl, "F");
  await field.pressSequentially(FIND_WORD);
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);
  await field.press("Enter");
  await expect(count).toHaveText(`2/${FIND_MATCHES}`);

  await calendar.getByRole("button", { name: "Load a frame" }).click();
  await expect
    .poll(
      async () =>
        (await calendar
          .frame({ url: /\/frame$/u })
          ?.evaluate(() => document.readyState)) ?? "none"
    )
    .toBe("complete");
  await delay(500);
  await expect(count).toHaveText(`2/${FIND_MATCHES}`);

  await calendar.getByRole("button", { name: "Open thread" }).click();
  await expect.poll(() => calendar.url()).toContain(THREAD_PATH);
  await expect(count).toHaveText("1/1");
});

test("the bar belongs to its tab: another tab hides it and opens its own empty, and coming back shows it again with its term and match, focus left on the page", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, calendar, bar, field, count } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const calendarHasFocus = await followRealFocus(calendar);

  await press(app, standIn.calendarUrl, "F");
  await field.pressSequentially(FIND_WORD);
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);
  await field.press("Enter");
  await expect(count).toHaveText(`2/${FIND_MATCHES}`);

  await clickMenuItem(app, "tab.next");
  await expect(bar).toHaveCount(0);
  expect(await barShown(app)).toBeFalsy();
  await findPage(app, standIn.driveUrl);
  await expect.poll(() => findOffered(app)).toBe(true);
  await press(app, standIn.driveUrl, "F");
  await expect(field).toHaveValue("");
  await press(app, "overlay", "Escape", { plain: true });
  await expect(bar).toHaveCount(0);

  await clickMenuItem(app, "tab.previous");
  await expect(field).toHaveValue(FIND_WORD);
  await expect(count).toHaveText(`2/${FIND_MATCHES}`);
  expect(
    near(await barCorner(app), await pageCorner(app, standIn.calendarUrl))
  ).toBe(true);
  await expect.poll(calendarHasFocus).toBeTruthy();
});

test("in a split the bar searches the focused pane from its top right; focusing the other pane hides it, and focusing this one again shows it", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, calendar, bar, field, count } = await launch(
    launchApp,
    userDataDir,
    standIn,
    SPLIT
  );
  const drive = await findPage(app, standIn.driveUrl);

  await press(app, standIn.calendarUrl, "F");
  await expect(field).toBeFocused();
  expect(
    near(await barCorner(app), await pageCorner(app, standIn.calendarUrl))
  ).toBe(true);
  await field.pressSequentially(FIND_WORD);
  await expect(count).toHaveText(`1/${FIND_MATCHES}`);

  await drive.getByRole("heading", { name: DRIVE_TITLE }).click();
  await expect(bar).toHaveCount(0);

  await press(app, standIn.driveUrl, "F");
  await expect(field).toHaveValue("");
  await expect(count).toHaveText("0/0");
  expect(
    near(await barCorner(app), await pageCorner(app, standIn.driveUrl))
  ).toBe(true);

  await calendar.getByRole("heading", { name: CALENDAR_TITLE }).click();
  await expect(field).toHaveValue(FIND_WORD);
  await expect(count).toHaveText(new RegExp(`^[1-9]/${FIND_MATCHES}$`, "u"));
  expect(
    near(await barCorner(app), await pageCorner(app, standIn.calendarUrl))
  ).toBe(true);
});

test("with the find field focused, the zoom keys zoom the page under the bar, not the bar", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, field } = await launch(launchApp, userDataDir, standIn);

  await press(app, standIn.calendarUrl, "F");
  await expect(field).toBeFocused();

  await press(app, "overlay", "=");
  await expect.poll(() => zoomOf(app, standIn.calendarUrl)).toBe(0.5);
  expect([
    await zoomOf(app, "overlay"),
    await zoomOf(app, "meru-app:"),
  ]).toStrictEqual([0, 0]);

  await press(app, "overlay", "-");
  await expect.poll(() => zoomOf(app, standIn.calendarUrl)).toBe(0);
  await press(app, "overlay", "=");
  await expect.poll(() => zoomOf(app, standIn.calendarUrl)).toBe(0.5);
  await press(app, "overlay", "0");
  await expect.poll(() => zoomOf(app, standIn.calendarUrl)).toBe(0);
  await expect(field).toBeFocused();
});

test("a tab put to sleep closes the bar and has no Find, nor does a page under Open app", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const { app, bar, field } = await launch(launchApp, userDataDir, standIn);

  await expect.poll(() => findOffered(app)).toBe(true);
  await press(app, standIn.calendarUrl, "F");
  await expect(field).toBeFocused();

  await clickMenuItem(app, "tab.sleep");
  await expect(bar).toHaveCount(0);
  await expect.poll(() => findOffered(app)).toBe(false);
  await press(app, "meru-app:", "F");
  await expect(bar).toHaveCount(0);

  await clickMenuItem(app, "tab.sleep");
  await expect.poll(() => findOffered(app)).toBe(true);
  await clickMenuItem(app, "app.open");
  await expect.poll(() => findOffered(app)).toBe(false);
});
