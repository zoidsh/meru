// Copy goes to the suite build's clipboard, kept on main's global; nothing
// here writes the system's clipboard.
import { readFile } from "node:fs/promises";

import type { ElectronApplication, Page } from "@playwright/test";

import { NO_TRIAL, expect, test } from "./lib/app.ts";
import { openSection, openSettings } from "./lib/settings.ts";
import { THEMES, emulateTheme, onlyWithShots, shotPath } from "./lib/shots.ts";

/** The version the packed build carries, read from the manifest it was packed from. */
const buildVersion = async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf-8")
  ) as { version: string };

  return manifest.version;
};

/** This platform's operating system as the page shows it. */
const OPERATING_SYSTEM = {
  darwin: /^macOS \d+(?:\.\d+)* \((?:arm64|x64)\)$/u,
  win32: /^Windows 1[01] \d+ \((?:arm64|x64|ia32)\)$/u,
  linux: /^.+ \((?:arm64|x64)\)$/u,
}[process.platform as "darwin" | "win32" | "linux"];

const copied = (app: ElectronApplication) =>
  app.evaluate(() => Reflect.get(globalThis, "meruTestClipboard") as string[]);

const openAbout = async (app: ElectronApplication) => {
  const page = await openSettings(app);

  await openSection(page, "About");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About");

  return page;
};

const copyButton = (page: Page, name: string) =>
  page.getByRole("main").getByRole("button", { name, exact: true });

/** Each row's label, the value its Copy describes, and what Copy wrote. */
const expectRows = async (app: ElectronApplication, page: Page) => {
  const main = page.getByRole("main");

  await expect(main.getByText("Version", { exact: true })).toBeVisible();
  await expect(
    main.getByText("Operating system", { exact: true })
  ).toBeVisible();

  const version = copyButton(page, "Copy version");
  const system = copyButton(page, "Copy operating system");

  await expect(version).toHaveAccessibleDescription(await buildVersion());
  await expect(system).toHaveAccessibleDescription(OPERATING_SYSTEM);
  await expect(main.getByRole("button")).toHaveCount(2);

  const systemText =
    (await main.getByText(OPERATING_SYSTEM).textContent()) ?? "";

  await version.click();
  await expect(main.getByRole("status")).toHaveText(["Copied", ""]);
  await system.click();
  await expect(main.getByRole("status")).toHaveText(["Copied", "Copied"]);
  await expect
    .poll(() => copied(app))
    .toStrictEqual([await buildVersion(), systemText]);
  await expect(main.getByRole("status")).toHaveText(["", ""], {
    timeout: 5000,
  });
};

test("is the nav's last section, after Meru Pro, with no scopes", async ({
  app,
}) => {
  const page = await openAbout(app);
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  const names = await nav.getByRole("button").allTextContents();

  expect(names.slice(-2)).toStrictEqual(["Meru Pro", "About"]);
  await expect(nav.getByRole("button", { name: "About" })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByRole("tablist")).toHaveCount(0);
});

test("shows the version and the operating system, each copied by its button", async ({
  app,
}) => {
  await expectRows(app, await openAbout(app));
});

test("is the same on the free version, with no Meru Pro badge", async ({
  launchApp,
}) => {
  const app = await launchApp(NO_TRIAL);
  const page = await openAbout(app);

  await expect(
    page.getByRole("main").getByRole("button", { name: /^Meru Pro/u })
  ).toHaveCount(0);
  await expectRows(app, page);
});

test.describe("shots", () => {
  test.beforeEach(onlyWithShots);

  test("the page, light and dark", async ({ app }) => {
    const page = await openAbout(app);

    for (const theme of THEMES) {
      // oxlint-disable-next-line no-await-in-loop -- one theme at a time
      await emulateTheme(app, theme);
      // oxlint-disable-next-line no-await-in-loop -- one after another
      await page.screenshot({ path: shotPath("settings-about", theme) });
    }
  });
});
