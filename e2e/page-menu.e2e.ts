import { realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Locator, Page } from "@playwright/test";

import {
  chooseContextMenuItem,
  expect,
  findPage,
  openContextMenu,
  readOpenedExternally,
  readState,
  test,
  writeState,
} from "./lib/app.ts";
import type { StandIn } from "./lib/stand-in.ts";
import {
  CALENDAR_TITLE,
  ELSEWHERE_URL,
  IMAGE_URL,
  MISSPELT,
  PAGE_MENU_PARTS,
  PAGE_MENU_PATH,
  POPOUT_PATH,
  POPOUT_TITLE,
  STAND_IN_TITLE,
} from "./lib/stand-in.ts";

const isMacOS = process.platform === "darwin";

/** Gmail, then Calendar at the page of things to right-click, selected. */
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
            url: `${standIn.calendarUrl}${PAGE_MENU_PATH.slice(1)}`,
            title: CALENDAR_TITLE,
          },
        ],
        selectedTabId: "c",
      },
    ],
    selectedProfileId: "p",
  });

const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn
) => {
  await seed(userDataDir, standIn);

  const app = await launchApp();
  const calendar = await findPage(
    app,
    `${standIn.calendarUrl}${PAGE_MENU_PATH.slice(1)}`
  );

  return { app, calendar };
};

/** The items of the menu a right click on `target` pops up. */
const menuOn = async (
  app: ElectronApplication,
  target: Locator,
  position?: { x: number; y: number }
) => {
  const { items } = await openContextMenu(app, () =>
    target.click({ button: "right", ...(position && { position }) })
  );

  return items;
};

const readPageActions = (app: ElectronApplication) =>
  app.evaluate(
    () => Reflect.get(globalThis, "meruTestPageActions") as string[]
  );

const readCopied = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestClipboard") as string[]);

const readMenuCount = (app: ElectronApplication) =>
  app.evaluate(
    () => (Reflect.get(globalThis, "meruTestContextMenus") as unknown[]).length
  );

const readLog = (userDataDir: string) =>
  readFile(path.join(userDataDir, "logs", "main.log"), "utf-8").catch(() => "");

/** Each download listed: its folder, its file and how it ended. */
const readDownloads = async (userDataDir: string) => {
  const state = await readState<{
    downloads?: { path: string; state: string }[];
  }>(userDataDir);

  return state.downloads?.map((entry) => [
    realpathSync.native(path.dirname(entry.path)),
    path.basename(entry.path),
    entry.state,
  ]);
};

/** The first item of the menu a right click on `target` pops up. */
const firstOn = async (
  app: ElectronApplication,
  target: Locator,
  position?: { x: number; y: number }
) => {
  const [first] = await menuOn(app, target, position);

  return first;
};

/** Where Windows and Linux add Select All, before the next group's line. */
const SELECT_ALL = isMacOS ? [] : ["Select All"];

const TAB_ITEMS = ["Copy URL", "Open in Default Browser"];

const part = (calendar: Page, name: keyof typeof PAGE_MENU_PARTS) =>
  calendar.getByText(PAGE_MENU_PARTS[name], { exact: true });

test("pops up a page's menu with the groups its right click calls for, in another app's tab", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);
  const tail = [...TAB_ITEMS, "—", "Inspect Element"];

  expect(await menuOn(app, part(calendar, "plain"))).toStrictEqual([
    ...(isMacOS ? [] : [...SELECT_ALL, "—"]),
    ...tail,
  ]);

  await part(calendar, "plain").selectText();

  expect(await menuOn(app, part(calendar, "plain"))).toStrictEqual([
    ...(isMacOS ? [`Look Up “${PAGE_MENU_PARTS.plain}”`, "—"] : []),
    "Search with Google",
    "—",
    "Copy",
    ...SELECT_ALL,
    "—",
    ...tail,
  ]);

  await calendar.evaluate(() => {
    globalThis.getSelection()?.removeAllRanges();
  });

  const anyEdit = [...SELECT_ALL, ...(isMacOS ? [] : ["—"])];
  // A right click on macOS selects the word under it, which on a link gets
  // no Look Up.
  const onWord = isMacOS
    ? ["Search with Google", "—", "Copy", "—"]
    : ["Select All", "—"];

  expect(
    await menuOn(
      app,
      calendar.getByRole("link", { name: PAGE_MENU_PARTS.link })
    )
  ).toStrictEqual([...onWord, "Copy Link Address", "—", ...tail]);
  expect(
    await menuOn(
      app,
      calendar.getByRole("link", { name: PAGE_MENU_PARTS.mailto })
    )
  ).toStrictEqual([
    ...onWord,
    "Copy Email Address",
    "—",
    "Copy Link Address",
    "—",
    ...tail,
  ]);
  expect(
    await menuOn(
      app,
      calendar.getByRole("img", { name: PAGE_MENU_PARTS.image, exact: true })
    )
  ).toStrictEqual([
    ...anyEdit,
    "Save Image As…",
    "Copy Image",
    "Copy Image Address",
    "—",
    ...tail,
  ]);
  expect(
    await menuOn(
      app,
      calendar.getByRole("img", {
        name: PAGE_MENU_PARTS.largeImage,
        exact: true,
      })
    )
  ).toStrictEqual([
    ...anyEdit,
    "Save Image As…",
    "Copy Image",
    "Copy Image Address (off)",
    "—",
    ...tail,
  ]);
  await chooseContextMenuItem(app, "Save Image As…");
  await expect
    .poll(() => readLog(userDataDir))
    .toContain("page-image-unsaved reason=no-address");

  // A page that handles the right click itself gets no menu of Meru's.
  const before = await readMenuCount(app);

  await calendar
    .getByRole("row", { name: PAGE_MENU_PARTS.ownMenu })
    .click({ button: "right" });

  expect(await menuOn(app, part(calendar, "plain"))).toStrictEqual([
    ...(isMacOS ? [] : [...SELECT_ALL, "—"]),
    ...tail,
  ]);
  expect(await readMenuCount(app)).toBe(before + 1);
});

test("copies a link's and an email link's address, searches Google and opens the page in the default browser, and saves an image where the Save dialog says", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);
  const pageUrl = `${standIn.calendarUrl}${PAGE_MENU_PATH.slice(1)}`;

  await menuOn(app, calendar.getByRole("link", { name: PAGE_MENU_PARTS.link }));
  await chooseContextMenuItem(app, "Copy Link Address");
  await menuOn(
    app,
    calendar.getByRole("link", { name: PAGE_MENU_PARTS.mailto })
  );
  await chooseContextMenuItem(app, "Copy Email Address");

  const image = calendar.getByRole("img", {
    name: PAGE_MENU_PARTS.image,
    exact: true,
  });

  await menuOn(app, image);
  await chooseContextMenuItem(app, "Copy Image Address");
  await menuOn(app, image);
  await chooseContextMenuItem(app, "Copy Image");

  await part(calendar, "plain").selectText();
  await menuOn(app, part(calendar, "plain"));
  await chooseContextMenuItem(app, "Search with Google");
  await chooseContextMenuItem(app, "Copy");
  await chooseContextMenuItem(app, "Open in Default Browser");
  await chooseContextMenuItem(app, "Copy URL");
  await chooseContextMenuItem(app, "Inspect Element");

  await expect
    .poll(() => readCopied(app))
    .toStrictEqual([ELSEWHERE_URL, "ada@example.com", IMAGE_URL, pageUrl]);
  expect(await readOpenedExternally(app)).toStrictEqual([
    `https://www.google.com/search?q=${encodeURIComponent(PAGE_MENU_PARTS.plain).replaceAll("%20", "+")}`,
    pageUrl,
  ]);
  expect(await readPageActions(app)).toStrictEqual([
    "copyImage",
    "copy",
    "inspectElement",
  ]);

  const saved = path.join(realpathSync.native(userDataDir), "square.svg");

  await app.evaluate((_electron, answer) => {
    (
      Reflect.get(globalThis, "meruTestSaveDialog") as {
        answer: string | null;
      }
    ).answer = answer;
  }, saved);
  await menuOn(app, image);
  await chooseContextMenuItem(app, "Save Image As…");

  await expect
    .poll(() => readDownloads(userDataDir))
    .toStrictEqual([[path.dirname(saved), "square.svg", "completed"]]);

  const { size } = await stat(saved);

  expect(size).toBeGreaterThan(0);
});

test("gives Gmail's tab and its pop-out the menu without the tab's items, and corrects a misspelt word in a field", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, calendar } = await launch(launchApp, userDataDir, standIn);
  const gmail = await findPage(app, standIn.url);
  const bare = [...(isMacOS ? [] : [...SELECT_ALL, "—"]), "Inspect Element"];

  expect(
    await menuOn(app, gmail.getByRole("heading", { name: STAND_IN_TITLE }))
  ).toStrictEqual(bare);

  await gmail.getByRole("button", { name: "Pop out compose" }).click();

  const popout = await findPage(app, `${standIn.url}${POPOUT_PATH.slice(1)}`);

  expect(
    await menuOn(app, popout.getByRole("heading", { name: POPOUT_TITLE }))
  ).toStrictEqual(bare);

  const field = calendar.getByRole("textbox", { name: PAGE_MENU_PARTS.field });

  await field.fill("");

  // Whether Paste is enabled follows the system's clipboard, which the test
  // leaves alone.
  const inField = await menuOn(app, field);
  const empty = inField.map((label) =>
    label.startsWith("Paste") ? label.replace(" (off)", "") : label
  );

  expect(empty).toStrictEqual([
    "Cut (off)",
    "Copy (off)",
    "Paste",
    "Paste and Match Style",
    ...SELECT_ALL,
    "—",
    ...TAB_ITEMS,
    "—",
    "Inspect Element",
  ]);

  await field.pressSequentially(`${MISSPELT} `);

  test.skip(
    !isMacOS,
    "Windows and Linux spell check with Hunspell, whose dictionary the suite never downloads, so no word is marked"
  );

  // The spell checker marks the word a moment after it is typed.
  await expect
    .poll(() => firstOn(app, field, { x: 14, y: 10 }))
    .toBe("receive");
  expect(await menuOn(app, field, { x: 14, y: 10 })).toStrictEqual(
    expect.arrayContaining(["—", "Learn Spelling", "—"])
  );
  await chooseContextMenuItem(app, "Learn Spelling");
  await menuOn(app, field, { x: 14, y: 10 });
  await chooseContextMenuItem(app, "receive");

  await expect(field).toHaveValue("receive ");
  expect(await readPageActions(app)).toStrictEqual([
    `learnSpelling ${MISSPELT}`,
  ]);
});
