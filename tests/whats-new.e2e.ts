/*
 * What's new, the release notes on the settings page.
 *
 * The notes are GitHub release bodies, markup written outside the app, and the
 * page they render on holds the full IPC bridge. So their raw HTML must never
 * become elements, images must come from GitHub alone, and a link must leave
 * for the browser rather than take the window with it.
 */
import { expect, type Page, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { openSettingsPage } from "./lib/settings";

const GITHUB_IMAGE_URL =
  "https://github.com/user-attachments/assets/00000000-0000-4000-8000-0000000c0de5";

const ATTACKER_ORIGIN = "https://attacker.example";

const RELEASE_LINK_URL = "https://example.com/whats-new-e2e";

// The smallest valid PNG, one transparent pixel.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const meru = useApp();

let attackerRequestCount = 0;

test.beforeEach(async () => {
  attackerRequestCount = 0;

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
            `![Screenshot](${GITHUB_IMAGE_URL})`,
            `<img src="${ATTACKER_ORIGIN}/pixel.png">`,
            `![Tracker](${ATTACKER_ORIGIN}/markdown.png)`,
            "<details><summary>x</summary>y</details>",
            `Read [the details](${RELEASE_LINK_URL}).`,
          ].join("\n\n"),
        },
      ]),
    }),
  );

  await context.route(GITHUB_IMAGE_URL, (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG }),
  );

  await context.route(`${ATTACKER_ORIGIN}/**`, (route) => {
    attackerRequestCount += 1;

    return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG });
  });

  // Fulfilled so a click that navigates the window does not reach the network.
  await context.route(RELEASE_LINK_URL, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<p>Elsewhere</p>" }),
  );
});

let settings: Page;

/** The What's new page, once it shows the stubbed release. */
async function openWhatsNew() {
  settings = await meru.openSettings();

  await openSettingsPage(settings, "What's new");

  await expect(settings.getByText("v99.0.0")).toBeVisible();
}

function readOpenPageUrls() {
  return meru.app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((contents) => contents.getURL()),
  );
}

test("release notes render their markdown and none of their HTML", async () => {
  await openWhatsNew();

  await expect.soft(settings.locator("kbd", { hasText: "Enter" })).toBeVisible();

  const githubImage = settings.locator(`img[src="${GITHUB_IMAGE_URL}"]`);

  await expect(githubImage).toBeAttached();

  // Loaded, rather than present: a blocked image is still in the DOM.
  await expect
    .poll(() => githubImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBe(1);

  // Read once GitHub's image has loaded, which the others would have done beside it.
  expect
    .soft(
      await settings.locator(`[src*="attacker.example"], [href*="attacker.example"]`).count(),
      "elements pointing at attacker.example",
    )
    .toBe(0);

  expect.soft(attackerRequestCount, "requests to attacker.example").toBe(0);

  expect.soft(await settings.locator("details").count(), "details elements").toBe(0);
});

test("a link in the release notes opens in the browser, leaving the window where it was", async () => {
  await meru.app.evaluate(({ shell }) => {
    const openedUrls: string[] = [];

    Reflect.set(globalThis, "__openedUrls", openedUrls);

    shell.openExternal = async (url) => {
      openedUrls.push(url);
    };
  });

  await openWhatsNew();

  const pageUrl = settings.url();

  const linkBox = await settings.getByRole("link", { name: "the details" }).boundingBox();

  if (!linkBox) {
    throw new Error("The link has no box to click");
  }

  // By the mouse, not `locator.click()`, which would wait on any navigation the
  // click starts.
  await settings.mouse.click(linkBox.x + linkBox.width / 2, linkBox.y + linkBox.height / 2);

  // Soft, so a click that navigated the window still reports where it went.
  await expect
    .configure({ soft: true })
    .poll(() => meru.app.evaluate(() => Reflect.get(globalThis, "__openedUrls")))
    .toEqual([RELEASE_LINK_URL]);

  // Read from the main process: a locator would wait on a navigation that left.
  expect(await readOpenPageUrls()).toContain(pageUrl);
});
