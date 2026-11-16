import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication } from "@playwright/test";

import { expect, findPage, test } from "./lib/app.ts";
import {
  ELSEWHERE_URL,
  POPUP_TITLE,
  STAND_IN_COOKIE,
  STAND_IN_TITLE,
} from "./lib/stand-in.ts";

/** The window's content size and where each of its child views sits. */
const readLayout = (app: ElectronApplication) =>
  app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    if (!window) {
      throw new Error("The app has no window");
    }

    const [width = 0, height = 0] = window.getContentSize();

    return {
      content: { width, height },
      views: window.contentView.children.map((view) => view.getBounds()),
    };
  });

const readState = async (userDataDir: string) =>
  JSON.parse(await readFile(path.join(userDataDir, "state.json"), "utf-8")) as {
    version: number;
    profiles: { id: string; name: string }[];
    selectedProfileId: string;
  };

test("shows the stand-in in the content rectangle below the titlebar, and follows a resize", async ({
  app,
  shell,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await expect(
    view.getByRole("heading", { name: STAND_IN_TITLE })
  ).toBeVisible();

  const { content, views } = await readLayout(app);

  expect(views).toStrictEqual([
    { x: 0, y: 40, width: content.width, height: content.height - 40 },
  ]);
  expect(
    await view.evaluate(() => [window.innerWidth, window.innerHeight])
  ).toStrictEqual([content.width, content.height - 40]);

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
      const layout = await readLayout(app);

      return layout.views;
    })
    .toStrictEqual([{ x: 0, y: 40, width: 900, height: 600 }]);
  await expect
    .poll(() => view.evaluate(() => [window.innerWidth, window.innerHeight]))
    .toStrictEqual([900, 600]);
});

test("a second launch keeps the profile and its session's cookie", async ({
  launchApp,
  standIn,
  userDataDir,
}) => {
  const first = await launchApp();

  await findPage(first, standIn.url);

  const { profiles, selectedProfileId } = await readState(userDataDir);

  expect(profiles).toStrictEqual([{ id: selectedProfileId, name: "Default" }]);
  expect(standIn.cookieHeaders).toStrictEqual([""]);

  await first.close();

  const second = await launchApp();

  await findPage(second, standIn.url);

  const relaunched = await readState(userDataDir);

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

/** Records what would open in the system browser, opening nothing. */
const stubSystemBrowser = (app: ElectronApplication) =>
  app.evaluate(({ shell }) => {
    const opened: string[] = [];

    Reflect.set(globalThis, "openedExternally", opened);
    shell.openExternal = (url) => {
      opened.push(url);

      return Promise.resolve();
    };
  });

const readOpenedExternally = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "openedExternally") as string[]);

test("hands a link to another site to the system browser", async ({
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
});

test("opens a sign-in pop-up as a child of the shell window in the same session", async ({
  app,
  standIn,
}) => {
  const view = await findPage(app, standIn.url);

  await stubSystemBrowser(app);
  await view.getByRole("link", { name: "Open a pop-up" }).click();

  const popup = await findPage(app, `${standIn.url}popup`);

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
    }, `${standIn.url}popup`)
  ).toStrictEqual({
    parent: expect.stringMatching(/^meru-app:/u),
    visible: true,
  });

  await popup.getByRole("link", { name: "Another site" }).click();

  await expect
    .poll(() => readOpenedExternally(app))
    .toStrictEqual([ELSEWHERE_URL]);
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
  const fresh = await readState(userDataDir);

  expect(fresh.profiles).toHaveLength(1);
});
