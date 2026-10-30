/*
 * The Content-Security-Policy every renderer page carries.
 *
 * The renderer holds an IPC bridge to the main process, so markup that reaches
 * it from outside must not be able to run script or send data anywhere. The
 * policy is the layer that holds when sanitizing misses something, and these
 * tests prove both that it blocks and that nothing the pages do themselves
 * trips it.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import { openSettingsPage, readSettingsPageLabels } from "./lib/settings";

/*
 * Written out rather than imported from the build script, which builds on
 * import. A copy here is also what makes a loosened policy fail the test.
 */
const PACKAGED_POLICY =
  "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://www.google.com https://*.gstatic.com https://github.com https://*.githubusercontent.com https://github-production-user-asset-6210df.s3.amazonaws.com; font-src 'self'; media-src 'self'; connect-src https://api.github.com https://cdn.jsdelivr.net; object-src 'none'; base-uri 'none'; form-action 'none'";

const RENDERER_BUILD_DIR = path.join(process.cwd(), "build-js", "renderer");

/*
 * An image pasted into a release is served from github.com, which redirects an
 * anonymous request such as the renderer's to GitHub's S3 bucket. Playwright
 * does not follow a redirect it fulfills for an image, so each hop is its own
 * image here.
 */
const RELEASE_IMAGE_URLS = [
  "https://github.com/user-attachments/assets/00000000-0000-4000-8000-00000000c5e2",
  "https://github-production-user-asset-6210df.s3.amazonaws.com/1/csp-e2e.png",
];

// The smallest valid PNG, one transparent pixel.
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

const EMOJIBASE_MESSAGES = {
  groups: [{ key: "smileys-emotion", message: "smileys & emotion", order: 0 }],
  subgroups: [],
  skinTones: ["light", "medium-light", "medium", "medium-dark", "dark"].map((key) => ({
    key,
    message: key,
  })),
};

const EMOJIBASE_DATA = [
  { emoji: "😀", label: "grinning face", group: 0, subgroup: 0, version: 1, tags: ["face"] },
];

type Violation = { directive: string; blockedURI: string };

/*
 * Installed before any page script runs, so a violation during startup is
 * recorded as well as one during the test.
 */
const RECORD_VIOLATIONS = `
  window.__cspViolations = [];
  document.addEventListener("securitypolicyviolation", (event) => {
    window.__cspViolations.push({
      directive: event.effectiveDirective,
      blockedURI: event.blockedURI,
    });
  });
`;

const meru = useApp();

async function recordViolationsFromLoad() {
  await meru.app.context().addInitScript(RECORD_VIOLATIONS);

  await meru.renderer.reload();

  await expect(meru.renderer.locator("#root > *").first()).toBeAttached();
}

function readViolations() {
  return meru.renderer.evaluate(
    () => Reflect.get(window, "__cspViolations") as Violation[] | undefined,
  );
}

test("every built renderer page carries the policy first in its head", async () => {
  const pageFileNames = (await readdir(RENDERER_BUILD_DIR)).filter((fileName) =>
    fileName.endsWith(".html"),
  );

  // Guards the reading itself: an empty directory would pass the loop below.
  expect(pageFileNames).toEqual(
    expect.arrayContaining([
      "main.html",
      "bookmarks.html",
      "desktop-sources.html",
      "recent-download-history.html",
      "workspace-app.html",
    ]),
  );

  for (const pageFileName of pageFileNames) {
    const html = await readFile(path.join(RENDERER_BUILD_DIR, pageFileName), "utf8");

    const policies = Array.from(
      html.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"/gi),
      // Vite writes the attribute's quotes as entities.
      (match) => match[1]?.replaceAll("&#39;", "'"),
    );

    expect.soft(policies, pageFileName).toEqual([PACKAGED_POLICY]);

    expect
      .soft(
        /<head>\s*<meta\s+http-equiv="Content-Security-Policy"/i.test(html),
        `${pageFileName} has the policy as the first element in <head>`,
      )
      .toBe(true);
  }
});

test("main.html refuses injected script, frames and connections", async () => {
  // Answered locally, so that a run without the policy fails on the
  // assertions below rather than on the network.
  await meru.app
    .context()
    .route("https://example.com/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<p>stand-in</p>" }),
    );

  await recordViolationsFromLoad();

  const fetchOutcome = await meru.renderer.evaluate(async () => {
    const script = document.createElement("script");

    script.textContent = "window.__pwned = 1";

    document.head.append(script);

    const frame = document.createElement("iframe");

    frame.src = "https://example.com/";

    document.body.append(frame);

    try {
      await fetch("https://example.com/");

      return "fetched";
    } catch {
      return "refused";
    }
  });

  expect(fetchOutcome).toBe("refused");

  expect(await meru.renderer.evaluate(() => Reflect.get(window, "__pwned"))).toBeUndefined();

  /*
   * The violations are the proof, not the refused fetch: a fetch also fails
   * for reasons that have nothing to do with the policy.
   */
  await expect
    .poll(async () => (await readViolations())?.map(({ directive }) => directive).sort())
    .toEqual(expect.arrayContaining(["connect-src", "frame-src", "script-src-elem"]));
});

test("nothing the settings pages do violates the policy", async () => {
  const jsdelivrRequests: string[] = [];

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
          body: `Press <kbd>Enter</kbd> to send.\n\n${RELEASE_IMAGE_URLS.map((url) => `<img src="${url}" alt="Screenshot">`).join("\n\n")}`,
        },
      ]),
    }),
  );

  for (const url of RELEASE_IMAGE_URLS) {
    await context.route(url, (route) =>
      route.fulfill({ status: 200, contentType: "image/png", body: PIXEL_PNG }),
    );
  }

  await context.route("https://cdn.jsdelivr.net/**", (route) => {
    const url = route.request().url();

    jsdelivrRequests.push(url);

    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { etag: '"csp-e2e"' },
      body: JSON.stringify(url.endsWith("/messages.json") ? EMOJIBASE_MESSAGES : EMOJIBASE_DATA),
    });
  });

  /*
   * Activating a key asks Meru's API and answers a bad one with a native
   * dialog nobody is here to dismiss. Only the form's submission matters here,
   * so the handler is swapped for one that records the call and succeeds.
   */
  await meru.app.evaluate(({ ipcMain }) => {
    ipcMain.removeHandler("licenseKey.activate");

    ipcMain.handle("licenseKey.activate", (_event, licenseKey: string) => {
      Reflect.set(globalThis, "__activatedLicenseKey", licenseKey);

      return { success: true };
    });
  });

  await recordViolationsFromLoad();

  const navigation = await meru.openSettings();

  for (const label of await readSettingsPageLabels(navigation)) {
    await openSettingsPage(meru, navigation, label);
  }

  await openSettingsPage(meru, navigation, "What's new");

  await expect(meru.renderer.locator("kbd", { hasText: "Enter" })).toBeVisible();

  for (const url of RELEASE_IMAGE_URLS) {
    const releaseImage = meru.renderer.locator(`img[src="${url}"]`);

    await expect(releaseImage).toBeAttached();

    // Loaded, rather than present: a blocked image is still in the DOM. Only
    // the stubs above can have answered it.
    await expect
      .poll(() => releaseImage.evaluate((image) => (image as HTMLImageElement).naturalWidth), {
        message: url,
      })
      .toBe(1);
  }

  await openSettingsPage(meru, navigation, "Accounts");

  // Editing rather than adding, since adding a second account is Pro.
  await meru.renderer.getByTitle("Edit account").first().click();

  const editAccount = meru.renderer.getByRole("dialog", { name: "Edit account" });

  await editAccount.getByTitle("Pick emoji").click();

  const emoji = meru.renderer.getByRole("gridcell", { name: "Grinning face" });

  await expect(emoji).toBeVisible();

  expect(jsdelivrRequests.length).toBeGreaterThan(0);

  expect(jsdelivrRequests.every((url) => new URL(url).origin === "https://cdn.jsdelivr.net")).toBe(
    true,
  );

  await emoji.click();

  await editAccount.getByRole("button", { name: "Cancel" }).click();

  await expect(editAccount).toBeHidden();

  await openSettingsPage(meru, navigation, "License");

  await meru.renderer.getByRole("button", { name: "Activate", exact: true }).click();

  const activateLicense = meru.renderer.getByRole("dialog", { name: "Activate license key" });

  await activateLicense.getByLabel("License key").fill("MERU-CSP0-E2E0-0000-0000-0000");

  await activateLicense.getByRole("button", { name: "Activate", exact: true }).click();

  await expect
    .poll(() => meru.app.evaluate(() => Reflect.get(globalThis, "__activatedLicenseKey")))
    .toBe("MERU-CSP0-E2E0-0000-0000-0000");

  expect(await readViolations()).toEqual([]);
});
