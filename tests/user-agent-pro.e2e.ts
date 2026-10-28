/*
 * The user agent the app sends, read off a page the suite serves itself.
 *
 * Every other view in this suite loads a Google property, where the string is
 * unassertable and matters anyway: which sign-in page Google serves depends on
 * it, and a heavier one costs every test that waits on a view. Here the header
 * is read rather than inferred — `tests/lib/server.ts` records what the view
 * sent, so both settings are asserted against the request the app actually
 * made, with nothing third-party in the answer.
 *
 * Under a license, because a workspace app view is the only view a test can
 * point at a page of its own, and saved tabs are restored only with a valid key
 * — see `tests/workspace-apps.e2e.ts` for the free version's side of that.
 *
 * Two apps, so two `describe` blocks: the seed is read once per `useProApp`
 * call, and the setting decides what the app sends before it creates a window.
 */
import { expect, test } from "@playwright/test";
import { seedAccount, seedSavedTab } from "./lib/accounts";
import { type SeedConfig, useProApp } from "./lib/app";
import { startTestServer, type TestServer } from "./lib/server";

const ACCOUNT_ID = "5eeded00-0000-4000-8000-00000000ac01";

/*
 * A page per app, so each reads the header its own view sent. One title shared
 * between the two would leave the second assertion able to pass on the first
 * app's request.
 */
const CHROME_PAGE_TITLE = "Chrome Stand-In";

const ELECTRON_PAGE_TITLE = "Electron Stand-In";

let server: TestServer;

test.beforeAll(async () => {
  server = await startTestServer();
});

test.afterAll(async () => {
  await server.close();
});

/*
 * A function rather than an object, because the port the server ends up on
 * cannot be named while this file is being read.
 */
function seedRestoredTab(pageTitle: string, defaultUserAgent: boolean): SeedConfig {
  return () => ({
    "app.defaultUserAgent": defaultUserAgent,
    accounts: [
      seedAccount({
        id: ACCOUNT_ID,
        label: "Default",
        savedTabs: [
          seedSavedTab({
            app: "calendar",
            url: server.pageUrl(pageTitle),
            title: "Calendar",
            loadOnLaunch: true,
          }),
        ],
      }),
    ],
  });
}

/**
 * Waits for the view restored during startup to have fetched its page.
 *
 * `loadLaunchTabs` runs as part of startup, which the harness does not wait on
 * — it waits for the renderer, and the two are not ordered against each other.
 */
async function readUserAgent(pageTitle: string) {
  await expect.poll(() => server.userAgentFor(pageTitle)).toBeTruthy();

  return server.userAgentFor(pageTitle) as string;
}

/*
 * Seeded either way round rather than left at the default for the shipped case,
 * so each app's string is decided by the test that reads it and neither
 * assertion moves if the default ever does.
 */
test.describe("with the default user agent off", () => {
  const meru = useProApp(seedRestoredTab(CHROME_PAGE_TITLE, false));

  test("a view asks for a page as Chrome does", async () => {
    const [chromeMajorVersion] = (await meru.app.evaluate(() => process.versions.chrome)).split(
      ".",
    );

    const userAgent = await readUserAgent(CHROME_PAGE_TITLE);

    // Chrome's reduced user agent: the major version, and zeros for the rest of
    // it whatever Chromium the app is built on.
    expect(userAgent).toContain(`Chrome/${chromeMajorVersion}.0.0.0`);

    /*
     * And neither token Electron's own string carries, either of which tells a
     * site this is not a browser.
     */
    expect(userAgent).not.toContain("Electron/");
    expect(userAgent).not.toContain("Meru/");
  });
});

test.describe("with the default user agent on", () => {
  const meru = useProApp(seedRestoredTab(ELECTRON_PAGE_TITLE, true));

  test("a view asks for a page as Electron does", async () => {
    const version = await meru.app.evaluate(({ app }) => app.getVersion());

    const userAgent = await readUserAgent(ELECTRON_PAGE_TITLE);

    // The string Electron builds, untouched: it names the app and itself, which
    // is the whole of what the setting is there to put back.
    expect(userAgent).toContain(`Meru/${version}`);
    expect(userAgent).toContain("Electron/");
  });
});
