import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { ms } from "@meru/shared/ms";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const DOWNLOADS_DIRECTORY = "configured-downloads";

const meru = useApp(async ({ userDataDir }) => {
  const downloadsLocation = path.join(userDataDir, DOWNLOADS_DIRECTORY);

  await mkdir(downloadsLocation);

  return { "downloads.location": downloadsLocation, "downloads.saveAs": false };
});

const TOKEN = randomUUID();

const SENTINEL = `sentinel-${TOKEN}`;

type MainProcessGlobals = typeof globalThis & {
  contextMenu?: Electron.Menu;
  downloadState?: string;
  downloadUrls?: string[];
};

/** Opens the stand-in page in the account view, and keeps every menu the app pops up from showing. */
async function openContextMenuPage() {
  const { contextMenuPageUrl, signInUrl } = meru.gmailStandIn;

  const findAccountView = () => meru.app.windows().find((page) => page.url() === signInUrl);

  await expect.poll(findAccountView).toBeDefined();

  const accountView = findAccountView();

  if (!accountView) {
    throw new Error("The account view is gone");
  }

  await accountView.goto(contextMenuPageUrl(TOKEN));

  await meru.app.evaluate(({ Menu }) => {
    Menu.prototype.popup = function capture(this: Electron.Menu) {
      (globalThis as MainProcessGlobals).contextMenu = this;
    };
  });

  return async function rightClick(selector: string) {
    await meru.app.evaluate(() => {
      (globalThis as MainProcessGlobals).contextMenu = undefined;
    });

    await accountView.click(selector, { button: "right" });

    await expect
      .poll(() =>
        meru.app.evaluate(() => (globalThis as MainProcessGlobals).contextMenu !== undefined),
      )
      .toBe(true);
  };
}

function clickMenuItem(id: string) {
  return meru.app.evaluate((_electron, itemId) => {
    const item = (globalThis as MainProcessGlobals).contextMenu?.getMenuItemById(itemId);

    if (!item) {
      throw new Error(`The menu has no item ${itemId}`);
    }

    item.click();
  }, id);
}

function menuItemIds() {
  return meru.app.evaluate(() =>
    (globalThis as MainProcessGlobals).contextMenu?.items.map((item) => item.id),
  );
}

function readClipboard() {
  return meru.app.evaluate(({ clipboard }) => clipboard.readText());
}

/**
 * The clipboard is the whole machine's, so the wait is short: over a longer one,
 * whatever another app copies is what a failure reports having read.
 */
function expectClipboard(expected: string) {
  return expect.poll(readClipboard, { timeout: ms("5s") }).toBe(expected);
}

async function resetClipboard() {
  await meru.app.evaluate(({ clipboard }, text) => clipboard.writeText(text), SENTINEL);

  expect(await readClipboard()).toBe(SENTINEL);
}

test("Copy Link Address copies the address of a link, with or without text", async () => {
  const rightClick = await openContextMenuPage();

  for (const [selector, expected] of [
    ["#link", `https://example.com/${TOKEN}/link`],
    ["#link-without-text", `https://example.com/${TOKEN}/no-text`],
  ] as const) {
    await resetClipboard();

    await rightClick(selector);

    await clickMenuItem("copyLink");

    await expectClipboard(expected);
  }
});

test("Copy Image Address copies the address of an image", async () => {
  const rightClick = await openContextMenuPage();

  await resetClipboard();

  await rightClick("#image");

  await clickMenuItem("copyImageAddress");

  await expectClipboard(`${meru.gmailStandIn.contextMenuPageUrl(TOKEN)}/image.png`);
});

test("Copy Email Address copies the address without its scheme", async () => {
  const rightClick = await openContextMenuPage();

  await resetClipboard();

  await rightClick("#email");

  await clickMenuItem("copyEmailAddress");

  await expectClipboard(`${TOKEN}@example.com`);
});

test("Save Image As starts a download of the image", async () => {
  const rightClick = await openContextMenuPage();

  /*
   * Ahead of the app's own listeners and cancelling, so nothing lands in the
   * downloads folder and no save dialog can open.
   */
  await meru.app.evaluate(({ webContents }, url) => {
    const contents = webContents.getAllWebContents().find((page) => page.getURL() === url);

    if (!contents) {
      throw new Error("The account view is gone");
    }

    contents.session.prependListener("will-download", (_event, item) => {
      const main = globalThis as MainProcessGlobals;

      main.downloadUrls = [...(main.downloadUrls ?? []), item.getURL()];

      item.cancel();
    });
  }, meru.gmailStandIn.contextMenuPageUrl(TOKEN));

  await rightClick("#image");

  await clickMenuItem("saveImageAs");

  await expect
    .poll(() => meru.app.evaluate(() => (globalThis as MainProcessGlobals).downloadUrls))
    .toEqual([`${meru.gmailStandIn.contextMenuPageUrl(TOKEN)}/image.png`]);
});

test("Save Image As asks where to save, starting in the configured location, with saveAs off", async () => {
  const rightClick = await openContextMenuPage();

  await rightClick("#image");

  /*
   * The listener goes on after the click because `download()` adds its own during
   * the click, and this one has to read what every other listener left. The item
   * is cancelled before Electron gets to open the dialog, which it does only once
   * every listener has returned.
   */
  const started = await meru.app.evaluate(({ webContents }, url) => {
    const main = globalThis as MainProcessGlobals;

    const contents = webContents.getAllWebContents().find((page) => page.getURL() === url);

    if (!contents) {
      throw new Error("The account view is gone");
    }

    main.contextMenu?.getMenuItemById("saveImageAs")?.click();

    return new Promise<{ savePath: string; defaultPath: string | undefined }>((resolve) => {
      contents.session.once("will-download", (_event, item) => {
        item.once("done", (_doneEvent, state) => {
          main.downloadState = state;
        });

        resolve({
          savePath: item.getSavePath(),
          defaultPath: item.getSaveDialogOptions().defaultPath,
        });

        item.cancel();
      });
    });
  }, meru.gmailStandIn.contextMenuPageUrl(TOKEN));

  expect(started).toEqual({
    savePath: "",
    defaultPath: path.join(meru.userDataDir, DOWNLOADS_DIRECTORY, "image.png"),
  });

  await expect
    .poll(() => meru.app.evaluate(() => (globalThis as MainProcessGlobals).downloadState))
    .toBe("cancelled");
});

test("a text field offers the editing items, and Paste pastes", async () => {
  const rightClick = await openContextMenuPage();

  await resetClipboard();

  await rightClick("#input");

  expect(await menuItemIds()).toEqual(
    expect.arrayContaining(["cut", "copy", "paste", "pasteAndMatchStyle"]),
  );

  await clickMenuItem("paste");

  const accountView = meru.app
    .windows()
    .find((page) => page.url() === meru.gmailStandIn.contextMenuPageUrl(TOKEN));

  await expect.poll(() => accountView?.inputValue("#input")).toContain(SENTINEL);
});
