/*
 * A German start loads the German catalog and no other: in the main process, in
 * the renderer and in the Gmail preload, and in time for the first paint.
 *
 * The translations are read from the compiled catalogs rather than written
 * here, so a wording can change without this test.
 */
import { type Messages, setupI18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { messages as gmailDe } from "@meru/preload-gmail/locales/de";
import { messages as en } from "@meru/shared/i18n/locales/en";
import { SHIPPED_CATALOG_TAGS } from "@meru/shared/i18n/tags";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";

const meru = useApp({ "app.language": "de" });

const RENDERER_DIR = "build-js/renderer/";

const CATALOG_DELAY = 300;

const otherTags = SHIPPED_CATALOG_TAGS.filter((tag) => tag !== "en");

let translations: Partial<Record<string, Messages>> = {};

test.beforeAll(async () => {
  translations = Object.fromEntries(
    await Promise.all(
      otherTags.map(
        async (tag) =>
          [
            tag,
            ((await import(`@meru/shared/i18n/locales/${tag}.ts`)) as { messages: Messages })
              .messages,
          ] as const,
      ),
    ),
  );
});

/*
 * Translations long enough not to occur by chance, unlike their English, and
 * free of anything a bundler would escape, so they read in a bundle as they do
 * in the catalog.
 */
function readSampleTranslations(messages: Messages) {
  return Object.entries(messages)
    .flatMap(([id, message]) =>
      Array.isArray(message) && message.length === 1 && typeof message[0] === "string"
        ? [[id, message[0]] as const]
        : [],
    )
    .filter(
      ([id, message]) =>
        message.length >= 20 && /^[^"'\\`\n\u00a0]+$/.test(message) && en[id]?.[0] !== message,
    )
    .slice(0, 5)
    .map(([, message]) => message);
}

function translate(messages: Messages, message: string, context?: string) {
  return setupI18n({ locale: "de", messages: { de: messages } })._({
    id: generateMessageId(message, context),
    message,
  });
}

/**
 * The bundle files the main process has required from inside the app, by path
 * relative to the app.
 */
function readMainModules() {
  return meru.app.evaluate(({ app }) => {
    const { _cache: cache } = process.getBuiltinModule("node:module") as unknown as {
      _cache: Record<string, unknown>;
    };

    const appPath = app.getAppPath();

    return Object.keys(cache)
      .filter((modulePath) => modulePath.startsWith(appPath))
      .map((modulePath) => modulePath.slice(appPath.length + 1).replaceAll("\\", "/"));
  });
}

function readAppFile(relativePath: string) {
  return meru.app.evaluate(({ app }, filePath) => {
    const fs = process.getBuiltinModule("node:fs");

    const path = process.getBuiltinModule("node:path");

    return fs.readFileSync(path.join(app.getAppPath(), filePath), "utf8");
  }, relativePath);
}

/**
 * Holds the loaded app files to German's catalog in exactly one of them and
 * every other language's in none, and returns the one holding German.
 */
async function expectGermanCatalogAlone(appFiles: string[]) {
  expect(appFiles.length).toBeGreaterThan(0);

  const sources = await Promise.all(
    appFiles.map(async (appFile) => ({ appFile, source: await readAppFile(appFile) })),
  );

  let germanFiles: string[] = [];

  for (const tag of otherTags) {
    const samples = readSampleTranslations(translations[tag] ?? {});

    expect(samples.length, tag).toBeGreaterThan(0);

    const holdingFiles = sources
      .filter(({ source }) => samples.some((sample) => source.includes(sample)))
      .map(({ appFile }) => appFile);

    if (tag === "de") {
      germanFiles = holdingFiles;
    } else {
      expect(holdingFiles, tag).toEqual([]);
    }
  }

  expect(germanFiles).toHaveLength(1);

  return germanFiles[0];
}

test("the main process loads the German catalog alone", async () => {
  // Not the entry bundle, which every start reads whatever its language.
  expect(await expectGermanCatalogAlone(await readMainModules())).not.toBe("build-js/app.js");
});

test("the renderer loads the German catalog alone and paints German first", async () => {
  /*
   * Every title the page shows from its first commit on, so an English one
   * swapped for German a moment later is still caught.
   */
  await meru.app.context().addInitScript(() => {
    const shownTitles: string[] = [];

    Object.assign(window, { shownTitles });

    new MutationObserver(() => {
      for (const element of document.querySelectorAll("#root [title]")) {
        const title = element.getAttribute("title");

        if (title && !shownTitles.includes(title)) {
          shownTitles.push(title);
        }
      }
    }).observe(document, { attributes: true, childList: true, subtree: true });
  });

  const cdp = await meru.app.context().newCDPSession(meru.renderer);

  /*
   * Held back a moment, so a page that rendered before its catalog arrived
   * would show its English titles first and the recording above would catch
   * them. A loopback file otherwise loads too fast for the race to show.
   */
  let delayedCatalogRequests = 0;

  cdp.on("Fetch.requestPaused", ({ requestId }) => {
    delayedCatalogRequests += 1;

    setTimeout(() => {
      void cdp.send("Fetch.continueRequest", { requestId });
    }, CATALOG_DELAY);
  });

  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*/assets/de-*.js" }] });

  await meru.renderer.reload();

  const recentDownloadsTitle = translate(translations.de ?? {}, "Show recent download history");

  await expect(meru.renderer.getByTitle(recentDownloadsTitle)).toBeVisible();

  const shownTitles = await meru.renderer.evaluate(
    () => (window as unknown as { shownTitles: string[] }).shownTitles,
  );

  expect(shownTitles).toContain(recentDownloadsTitle);

  expect(shownTitles).not.toContain("Show recent download history");

  // Proves the delay above applied, which a renamed chunk would quietly undo.
  expect(delayedCatalogRequests).toBe(1);

  await cdp.send("Fetch.disable");

  // Chromium keeps no resource timing for a `file://` page, so the scripts
  // come from the debugger, which reports every one already parsed.
  const scriptUrls: string[] = [];

  cdp.on("Debugger.scriptParsed", ({ url }) => {
    if (url.includes(RENDERER_DIR) && !scriptUrls.includes(url)) {
      scriptUrls.push(url);
    }
  });

  await cdp.send("Debugger.enable");

  await cdp.detach();

  await expectGermanCatalogAlone(
    scriptUrls.map((scriptUrl) => `${RENDERER_DIR}${scriptUrl.split(RENDERER_DIR)[1]}`),
  );
});

test("the Gmail view shows its toast in German from a preload that carries no catalog but English", async () => {
  const preload = await readAppFile("build-js/preload-gmail.js");

  const messageSent = translate(gmailDe, "Message sent");

  expect(preload.includes(messageSent)).toBe(false);

  const { signInUrl } = meru.gmailStandIn;

  const findAccountView = () => meru.app.windows().find((page) => page.url() === signInUrl);

  await expect.poll(findAccountView).toBeDefined();

  const accountView = findAccountView();

  if (!accountView) {
    throw new Error("The account view is gone");
  }

  // What main sends once Gmail reports a message sent, which the stand-in
  // never will.
  await meru.app.evaluate(({ webContents }, url) => {
    webContents
      .getAllWebContents()
      .find((contents) => contents.getURL() === url)
      ?.send("gmail.showMessageSentNotification", 1);
  }, signInUrl);

  await expect(accountView.getByText(messageSent)).toBeVisible();

  await expect(
    accountView.getByRole("button", { name: translate(gmailDe, "Undo", "button") }),
  ).toBeVisible();
});
