import type { ElectronApplication } from "@playwright/test";

import { expect, inspect, must, panesOf, test } from "./app.ts";

/** Every window but the main one: its address and whether it shows. */
const popupsOf = async (app: ElectronApplication) =>
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .filter((window) => window.webContents.getURL() !== "")
      .filter((window) => !window.webContents.getURL().includes("chrome.html"))
      .map((window) => ({
        url: new URL(window.webContents.getURL()).host,
        visible: window.isVisible(),
      }))
  );

/** Runs `script` in the first pane's page as a click would, which window.open needs. */
const runInPane = async (app: ElectronApplication, script: string) => {
  const [pane] = await panesOf(app);
  const { contentsId } = must(pane, "The first pane");
  await app.evaluate(
    async ({ webContents }, [id, code]) => {
      await webContents.fromId(id)?.executeJavaScript(code, true);
    },
    [contentsId, script] as const
  );
};

/** Sends every session's requests through a proxy on a closed loopback port, so nothing the popups load leaves the machine. */
const offline = async (app: ElectronApplication) => {
  await app.evaluate(async ({ session, webContents }) => {
    const sessions = new Set([
      session.defaultSession,
      ...webContents.getAllWebContents().map((contents) => contents.session),
    ]);
    await Promise.all(
      [...sessions].map(async (found) => {
        await found.setProxy({ proxyRules: "127.0.0.1:9" });
      })
    );
  });
};

const CREATED = "meruE2ePopupsCreated";

/** Records, for each window made from now on, whether it was visible the moment it was made. */
const recordCreated = async (app: ElectronApplication) => {
  await app.evaluate(({ app: electronApp }, name) => {
    const created: boolean[] = [];
    Reflect.set(globalThis, name, created);
    electronApp.on("browser-window-created", (_event, window) => {
      created.push(window.isVisible());
    });
  }, CREATED);
};

const createdOf = async (app: ElectronApplication) =>
  await app.evaluate(
    (_electron, name): unknown => Reflect.get(globalThis, name),
    CREATED
  );

const closeSignIn = async (app: ElectronApplication) => {
  await app.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (window.webContents.getURL().includes("accounts.google.com")) {
        window.destroy();
      }
    }
  });
};

// Electron 45 opens `window.open("about:blank")` as a window of its own before the page points it anywhere, which is how Google's sign-in opens; these reproduce what the stage's popup handling answers.
test("shows a blank popup once it heads for Google's sign-in, sends any other to the browser, and closes one that never navigates", async ({
  launch,
}) => {
  const { app } = await launch();
  await expect.poll(async () => await panesOf(app)).toHaveLength(1);
  await offline(app);

  await runInPane(
    app,
    `window.open("about:blank").location = "https://accounts.google.com/o/oauth2/auth"; 1`
  );
  await expect
    .poll(async () => await popupsOf(app))
    .toStrictEqual([{ url: "accounts.google.com", visible: true }]);
  await closeSignIn(app);

  await runInPane(
    app,
    `window.open("about:blank").location = "https://example.com/elsewhere"; 1`
  );
  await expect
    .poll(async () => {
      const { external } = await inspect(app);
      return external;
    })
    .toStrictEqual(["https://example.com/elsewhere"]);

  await runInPane(
    app,
    `(() => { const w = window.open("", "printed"); w.document.write("<p>printed</p>"); w.document.close(); return 1; })()`
  );
  await expect
    .poll(async () => await popupsOf(app))
    .toStrictEqual([{ url: "", visible: false }]);
  await expect
    .poll(async () => await popupsOf(app), { timeout: 10_000 })
    .toStrictEqual([]);
});

// Were Electron to show a blank popup itself, the app could no longer keep one that goes elsewhere off the screen; this fails the day it does.
test("makes every blank popup hidden, and shows only one that heads for sign-in, two at once or one that waits almost to the timeout", async ({
  launch,
}) => {
  const { app } = await launch();
  await expect.poll(async () => await panesOf(app)).toHaveLength(1);
  await offline(app);
  await recordCreated(app);

  await runInPane(
    app,
    `window.open("about:blank").location = "https://accounts.google.com/o/oauth2/auth"; window.open("about:blank").location = "https://example.com/second"; 1`
  );
  await expect
    .poll(async () => await popupsOf(app))
    .toStrictEqual([{ url: "accounts.google.com", visible: true }]);
  await expect
    .poll(async () => {
      const { external } = await inspect(app);
      return external;
    })
    .toStrictEqual(["https://example.com/second"]);
  await closeSignIn(app);

  await runInPane(
    app,
    `(() => { const w = window.open("about:blank"); setTimeout(() => { w.location = "https://accounts.google.com/late"; }, 4900); return 1; })()`
  );
  await expect
    .poll(async () => await popupsOf(app), { timeout: 10_000 })
    .toStrictEqual([{ url: "accounts.google.com", visible: true }]);
  expect(await createdOf(app)).toStrictEqual([false, false, false]);
});
