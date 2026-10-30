/*
 * What's new, the release notes drawn over the app.
 *
 * The notes are GitHub release bodies, markup Meru does not control, so they
 * render in a page with no preload: whatever slips past sanitizing finds no
 * bridge to the main process there.
 */
import { expect, type Page, test } from "@playwright/test";
import { useApp } from "./lib/app";

const RELEASE_IMAGE_URLS = [
  "https://github.com/user-attachments/assets/00000000-0000-4000-8000-0000000c0de5",
  "https://github-production-user-asset-6210df.s3.amazonaws.com/1/whats-new-e2e.png",
];

const RELEASE_LINK_URL = "https://example.com/whats-new-e2e";

// The smallest valid PNG, one transparent pixel.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const meru = useApp();

test.beforeEach(async () => {
  const context = meru.app.context();

  await context.route("https://api.github.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 1,
          tag_name: "v99.0.0",
          published_at: "2026-01-01T00:00:00Z",
          prerelease: false,
          body: [
            "Press <kbd>Enter</kbd> to send.",
            ...RELEASE_IMAGE_URLS.map((url) => `<img src="${url}" alt="Screenshot">`),
            `Read [the details](${RELEASE_LINK_URL}).`,
          ].join("\n\n"),
        },
      ]),
    }),
  );

  for (const url of RELEASE_IMAGE_URLS) {
    await context.route(url, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG }),
    );
  }
});

/** Whichever page of the app is showing the stubbed release. */
async function openWhatsNew() {
  expect(await meru.runMenuCommand("What's New")).toBe(true);

  let releaseNotesPage: Page | undefined;

  await expect
    .poll(async () => {
      for (const page of meru.app.windows()) {
        if (await page.getByText("v99.0.0").isVisible()) {
          releaseNotesPage = page;

          return true;
        }
      }

      return false;
    })
    .toBe(true);

  return releaseNotesPage as Page;
}

function readOpenPageUrls() {
  return meru.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((contents) => contents.getURL()),
  );
}

async function expectClosed(releaseNotesPage: Page) {
  const url = releaseNotesPage.url();

  await expect.poll(readOpenPageUrls).not.toContain(url);
}

test("Help → What's New shows the release notes in a page with no bridge", async () => {
  const releaseNotesPage = await openWhatsNew();

  expect(await releaseNotesPage.evaluate(() => typeof Reflect.get(window, "electron"))).toBe(
    "undefined",
  );

  await expect(releaseNotesPage.locator("kbd", { hasText: "Enter" })).toBeVisible();

  for (const url of RELEASE_IMAGE_URLS) {
    const releaseImage = releaseNotesPage.locator(`img[src="${url}"]`);

    await expect(releaseImage).toBeAttached();

    // Loaded, rather than present: a blocked image is still in the DOM.
    await expect
      .poll(() => releaseImage.evaluate((image) => (image as HTMLImageElement).naturalWidth), {
        message: url,
      })
      .toBe(1);
  }
});

test("Escape closes What's new", async () => {
  const releaseNotesPage = await openWhatsNew();

  /*
   * Down alone: the keydown closes the page, so a press would send its keyup to
   * a page that is gone. Playwright's keys enter the same input pipeline the
   * keyboard's do, so the main process's `before-input-event` sees this one.
   */
  await releaseNotesPage.keyboard.down("Escape");

  await expectClosed(releaseNotesPage);
});

test("the close button closes What's new", async () => {
  const releaseNotesPage = await openWhatsNew();

  await releaseNotesPage.getByRole("button", { name: "Close" }).click();

  await expectClosed(releaseNotesPage);
});

test("a click on the dimmed app behind closes What's new", async () => {
  const releaseNotesPage = await openWhatsNew();

  await releaseNotesPage.mouse.click(4, 4);

  await expectClosed(releaseNotesPage);
});

test("a link in the release notes opens in the browser", async () => {
  await meru.app.evaluate(({ shell }) => {
    const openedUrls: string[] = [];

    Reflect.set(globalThis, "__openedUrls", openedUrls);

    shell.openExternal = async (url) => {
      openedUrls.push(url);
    };
  });

  const releaseNotesPage = await openWhatsNew();

  const pageUrl = releaseNotesPage.url();

  const linkBox = await releaseNotesPage.getByRole("link", { name: "the details" }).boundingBox();

  if (!linkBox) {
    throw new Error("The link has no box to click");
  }

  // By the mouse, not `locator.click()`, which waits for the navigation the
  // click starts to finish, and this one is refused.
  await releaseNotesPage.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);

  await expect
    .poll(() => meru.app.evaluate(() => Reflect.get(globalThis, "__openedUrls")))
    .toEqual([RELEASE_LINK_URL]);

  /*
   * Read from the main process and by evaluating, not with a locator: Playwright
   * saw the navigation start and never sees it end once it is refused, so its
   * locators would wait on it for good.
   */
  expect(await readOpenPageUrls()).toContain(pageUrl);

  expect(await releaseNotesPage.evaluate(() => document.body.textContent)).toContain("v99.0.0");
});

test("What's new follows the app's theme while open", async () => {
  function setTheme(themeSource: "light" | "dark") {
    return meru.app.evaluate(({ nativeTheme }, source) => {
      nativeTheme.themeSource = source;
    }, themeSource);
  }

  await setTheme("light");

  const releaseNotesPage = await openWhatsNew();

  // Playwright pins `prefers-color-scheme` to light in every page it attaches
  // to, unless told otherwise, which would hide the theme the app sets.
  await releaseNotesPage.emulateMedia({ colorScheme: null });

  const isDark = () =>
    releaseNotesPage.evaluate(() => document.documentElement.classList.contains("dark"));

  expect(await isDark()).toBe(false);

  // The source the Appearance setting sets, which the page has no bridge to
  // hear about other than through the color scheme Chromium reports.
  await setTheme("dark");

  await expect.poll(isDark).toBe(true);

  await setTheme("light");

  await expect.poll(isDark).toBe(false);
});

/** The URL of the main window's topmost child view, the one painted over all the others. */
function readTopViewUrl() {
  return meru.app.evaluate(({ BrowserWindow }) => {
    const [window] = BrowserWindow.getAllWindows();

    const topView = window?.contentView.children.at(-1) as Electron.WebContentsView | undefined;

    return topView?.webContents?.getURL() ?? "";
  });
}

test("What's new stays over views added while it is open", async () => {
  const releaseNotesPage = await openWhatsNew();

  const pageUrl = releaseNotesPage.url();

  expect(await readTopViewUrl()).toBe(pageUrl);

  /*
   * The window showing again re-adds the account's view to bring it to the
   * front, the same call switching account or tab makes. Switching account
   * itself would need Pro, which keeps a free run to one account, and an app
   * that can never be activated does not show a hidden window again, so the
   * event is emitted, which runs the app's own listener synchronously.
   */
  await meru.app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.emit("show");
  });

  expect(await readTopViewUrl()).toBe(pageUrl);

  // Any other view, added the way every caller adds one.
  await meru.app.evaluate(({ BrowserWindow, WebContentsView }) => {
    const [window] = BrowserWindow.getAllWindows();

    const view = new WebContentsView();

    Reflect.set(globalThis, "__addedView", view);

    window?.contentView.addChildView(view);
  });

  expect(await readTopViewUrl()).toBe(pageUrl);

  await meru.app.evaluate(({ BrowserWindow }) => {
    const view = Reflect.get(globalThis, "__addedView") as Electron.WebContentsView;

    BrowserWindow.getAllWindows()[0]?.contentView.removeChildView(view);

    view.webContents.close();
  });
});
