import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { TAB_STRIP_WIDTH, contentViewBounds } from "#core/layout.ts";

import {
  expect,
  findPage,
  readOpenedExternally,
  readState,
  readViews,
  stubSystemBrowser,
  test,
} from "./lib/app.ts";
import {
  ELSEWHERE_URL,
  POPUP_TITLE,
  STAND_IN_COOKIE,
  STAND_IN_TITLE,
} from "./lib/stand-in.ts";

interface SavedState {
  version: number;
  profiles: { id: string; name: string }[];
  selectedProfileId: string;
}

test("shows the stand-in in the content rectangle below the titlebar and beside the tab strip, and follows a resize", async ({
  app,
  shell,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await expect(
    view.getByRole("heading", { name: STAND_IN_TITLE })
  ).toBeVisible();

  const { area, views } = await readViews(app);

  const bounds = contentViewBounds(area, TAB_STRIP_WIDTH);

  expect(views.map((each) => each.bounds)).toStrictEqual([bounds]);
  expect(
    await view.evaluate(() => [window.innerWidth, window.innerHeight])
  ).toStrictEqual([bounds.width, bounds.height]);

  const titlebar = await shell
    .getByRole("banner", { name: "Title bar" })
    .boundingBox();

  expect(titlebar?.y).toBe(0);
  expect(titlebar?.height).toBe(40);

  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(900, 640);
  });

  await expect
    .poll(async () => {
      const layout = await readViews(app);

      return layout.views.map((each) => each.bounds);
    })
    .toStrictEqual([{ x: 224, y: 40, width: 668, height: 592 }]);
  await expect
    .poll(() => view.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toStrictEqual([668, 592]);
});

test("a second launch keeps the profile and its session's cookie", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const first = await launchApp();

  await findPage(first, standIn.url);

  const { profiles, selectedProfileId } =
    await readState<SavedState>(userDataDir);

  expect(profiles).toMatchObject([{ id: selectedProfileId, name: "Default" }]);
  expect(standIn.cookieHeaders).toStrictEqual([""]);

  await first.close();

  const second = await launchApp();

  await findPage(second, standIn.url);

  const relaunched = await readState<SavedState>(userDataDir);

  expect(relaunched.selectedProfileId).toBe(selectedProfileId);
  expect(standIn.cookieHeaders).toStrictEqual(["", STAND_IN_COOKIE]);
  expect(
    await second.evaluate(
      async ({ session }, { partition, url }) => {
        const cookies = await session.fromPartition(partition).cookies.get({
          url,
        });

        return cookies.map((cookie) => `${cookie.name}=${cookie.value}`);
      },
      { partition: `persist:${selectedProfileId}`, url: standIn.url }
    )
  ).toStrictEqual([STAND_IN_COOKIE]);
});

test("hands a link to another site to the system browser, and opens a sign-in pop-up as a window of its own in the same session", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await stubSystemBrowser(app);
  await view.getByRole("link", { name: "Another site" }).click();

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL]);
  expect(
    await app.evaluate(
      ({ BrowserWindow }) => BrowserWindow.getAllWindows().length
    )
  ).toBe(1);
  expect(view.url()).toBe(standIn.url);

  await view.getByRole("link", { name: "Open a pop-up" }).click();

  const popup = await findPage(app, standIn.popupUrl);

  await expect(popup.getByRole("heading", { name: POPUP_TITLE })).toBeVisible();
  expect(standIn.popupCookieHeaders).toStrictEqual([STAND_IN_COOKIE]);
  expect(
    await app.evaluate(({ BrowserWindow }, popupUrl) => {
      const child = BrowserWindow.getAllWindows().find(
        (window) => window.webContents.getURL() === popupUrl
      );

      return {
        parent: child?.getParentWindow()?.webContents.getURL() ?? "",
        visible: child?.isVisible(),
      };
    }, standIn.popupUrl)
  ).toStrictEqual({ parent: "", visible: true });

  await popup.getByRole("link", { name: "Another site" }).click();

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL, ELSEWHERE_URL]);
});

test("keeps an unreadable state file aside and still starts", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  await writeFile(path.join(userDataDir, "state.json"), "{ not json");

  const app = await launchApp();
  const view = await findPage(app, standIn.url);

  await expect(
    view.getByRole("heading", { name: STAND_IN_TITLE })
  ).toBeVisible();

  const names = await readdir(userDataDir);
  const aside = names.filter((name) =>
    /^state\.corrupt-\d+\.json$/u.test(name)
  );

  expect(aside).toHaveLength(1);
  expect(await readFile(path.join(userDataDir, aside[0] ?? ""), "utf-8")).toBe(
    "{ not json"
  );
  const fresh = await readState<SavedState>(userDataDir);

  expect(fresh.profiles).toHaveLength(1);
});
