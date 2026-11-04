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
  imageSrcUrl?: string;
  otherDownloadState?: string;
  savedImage?: { savePath: string; defaultPath: string | undefined };
  uncaughtErrors?: string[];
};

/** Opens the stand-in page in the account view, and keeps every menu the app pops up from showing. */
async function openContextMenuPage(pageUrl = meru.gmailStandIn.contextMenuPageUrl(TOKEN)) {
  const { signInUrl } = meru.gmailStandIn;

  const findAccountView = () => meru.app.windows().find((page) => page.url() === signInUrl);

  await expect.poll(findAccountView).toBeDefined();

  const accountView = findAccountView();

  if (!accountView) {
    throw new Error("The account view is gone");
  }

  await accountView.goto(pageUrl);

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

test("Save Image As still asks when another download finishes before the image's response starts", async () => {
  const { contextMenuPageUrl, fileUrl, heldCount, releaseHeld } = meru.gmailStandIn;

  const pageUrl = contextMenuPageUrl(TOKEN);

  const rightClick = await openContextMenuPage();

  await rightClick("#held-image");

  await meru.app.evaluate(
    ({ webContents }, { imageUrl, url }) => {
      const main = globalThis as MainProcessGlobals;

      const contents = webContents.getAllWebContents().find((page) => page.getURL() === url);

      if (!contents) {
        throw new Error("The account view is gone");
      }

      main.contextMenu?.getMenuItemById("saveImageAs")?.click();

      contents.session.on("will-download", (_event, item) => {
        if (item.getURLChain()[0] === imageUrl) {
          main.savedImage = {
            savePath: item.getSavePath(),
            defaultPath: item.getSaveDialogOptions().defaultPath,
          };

          item.cancel();
        } else {
          item.once("done", (_doneEvent, state) => {
            main.otherDownloadState = state;
          });
        }
      });
    },
    { imageUrl: `${pageUrl}/held-image.png`, url: pageUrl },
  );

  await expect.poll(heldCount).toBe(1);

  await meru.app.evaluate(
    ({ webContents }, { other, url }) => {
      webContents
        .getAllWebContents()
        .find((page) => page.getURL() === url)
        ?.downloadURL(other);
    },
    {
      other: fileUrl({ name: "other.txt", type: "text/plain", body: "Finishes first" }),
      url: pageUrl,
    },
  );

  await expect
    .poll(() => meru.app.evaluate(() => (globalThis as MainProcessGlobals).otherDownloadState))
    .toBe("completed");

  releaseHeld();

  await expect
    .poll(() => meru.app.evaluate(() => (globalThis as MainProcessGlobals).savedImage))
    .toEqual({
      savePath: "",
      defaultPath: path.join(meru.userDataDir, DOWNLOADS_DIRECTORY, "held-image.png"),
    });
});

test("Save Image As leaves the Dock badge and the badge count as they were", async () => {
  const rightClick = await openContextMenuPage();

  await rightClick("#image");

  const before = await meru.app.evaluate(
    ({ app, webContents }, { savePath, url }) => {
      const main = globalThis as MainProcessGlobals;

      const contents = webContents.getAllWebContents().find((page) => page.getURL() === url);

      if (!contents) {
        throw new Error("The account view is gone");
      }

      if (app.dock) {
        app.dock.setBadge("7");
      } else {
        app.badgeCount = 7;
      }

      main.contextMenu?.getMenuItemById("saveImageAs")?.click();

      // A save path of the test's own, so the image saves with no dialog to open.
      contents.session.once("will-download", (_event, item) => {
        item.setSavePath(savePath);

        item.once("done", (_doneEvent, state) => {
          main.downloadState = state;
        });
      });

      return { dock: app.dock?.getBadge(), count: app.badgeCount };
    },
    {
      savePath: path.join(meru.userDataDir, DOWNLOADS_DIRECTORY, "saved.png"),
      url: meru.gmailStandIn.contextMenuPageUrl(TOKEN),
    },
  );

  await expect
    .poll(() => meru.app.evaluate(() => (globalThis as MainProcessGlobals).downloadState))
    .toBe("completed");

  const after = await meru.app.evaluate(({ app }) => ({
    dock: app.dock?.getBadge(),
    count: app.badgeCount,
  }));

  expect(after).toEqual(before);
});

test("Save Image As on an image too large to have an address does nothing, and throws nothing", async () => {
  const pageUrl = `${meru.gmailStandIn.contextMenuPageUrl(TOKEN)}/large-data-image`;

  const rightClick = await openContextMenuPage(pageUrl);

  await meru.app.evaluate(({ webContents }, url) => {
    const main = globalThis as MainProcessGlobals;

    const contents = webContents.getAllWebContents().find((page) => page.getURL() === url);

    if (!contents) {
      throw new Error("The account view is gone");
    }

    main.uncaughtErrors = [];

    process.on("uncaughtException", (error) => {
      main.uncaughtErrors?.push(error.message);
    });

    contents.once("context-menu", (_event, parameters) => {
      main.imageSrcUrl = parameters.srcURL;
    });

    // Ahead of the app's own listeners and cancelling, so no save dialog can open.
    contents.session.prependListener("will-download", (_event, item) => {
      main.downloadUrls = [...(main.downloadUrls ?? []), item.getURL()];

      item.cancel();
    });
  }, pageUrl);

  await rightClick("#image");

  expect(await meru.app.evaluate(() => (globalThis as MainProcessGlobals).imageSrcUrl)).toBe("");

  expect(await menuItemIds()).toContain("saveImageAs");

  const countWindows = () =>
    meru.app.evaluate(({ BrowserWindow, webContents }) => ({
      windows: BrowserWindow.getAllWindows().length,
      webContents: webContents.getAllWebContents().length,
    }));

  const windowsBefore = await countWindows();

  await clickMenuItem("saveImageAs");

  // Long enough for a download of nothing to reach the session's listeners, were one started.
  await new Promise((resolve) => setTimeout(resolve, ms("2s")));

  expect(await meru.app.evaluate(() => (globalThis as MainProcessGlobals).uncaughtErrors)).toEqual(
    [],
  );

  expect(
    await meru.app.evaluate(() => (globalThis as MainProcessGlobals).downloadUrls),
  ).toBeUndefined();

  expect(await countWindows()).toEqual(windowsBefore);
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
