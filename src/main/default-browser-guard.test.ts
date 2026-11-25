import { describe, expect, it } from "vitest";

import type { Platform } from "#core/platform.ts";
import { fakeDefaultBrowser } from "#platform/default-browser.fake.ts";

import { createDefaultBrowserGuard } from "./default-browser-guard.ts";

const LINK = "https://example.org/";

const setup = (platform: Platform = "darwin") => {
  const { fake, defaultBrowser } = fakeDefaultBrowser();
  const opened: string[] = [];
  const copied: string[] = [];
  const logged: string[] = [];
  const guard = createDefaultBrowserGuard({
    platform,
    defaultBrowser,
    clipboard: {
      writeText: (text) => {
        copied.push(text);

        return Promise.resolve();
      },
    },
    log: (message) => {
      logged.push(message);
    },
  });
  const browser = guard.guard({
    open: (url) => {
      opened.push(url);

      return Promise.resolve();
    },
  });

  return { fake, defaultBrowser, browser, opened, copied, logged };
};

describe(createDefaultBrowserGuard, () => {
  it("opens Meru's own links in the browser while Meru is not the default, showing nothing", async () => {
    const { fake, browser, opened } = setup();

    await browser.open(LINK);

    expect([opened, fake.asked]).toStrictEqual([[LINK], []]);
  });

  it("holds Meru's own links too while Meru is the default, since each would come back to Meru", async () => {
    const { fake, browser, opened, copied } = setup();

    fake.isDefault = true;
    fake.answer = "copy";
    await browser.open(LINK);

    expect([opened, copied, fake.asked.length]).toStrictEqual([[], [LINK], 1]);
  });

  it("on macOS says why and offers System Settings first, then Copy Link and Cancel", async () => {
    const { fake, browser } = setup("darwin");

    fake.isDefault = true;
    await browser.open(LINK);

    expect(fake.asked).toStrictEqual([
      {
        message: "Meru is your default browser",
        detail:
          "Links can't leave Meru while it's your default browser. Choose another default browser in System Settings to open them.",
        buttons: [
          { choice: "settings", label: "Open System Settings" },
          { choice: "copy", label: "Copy Link" },
          { choice: "cancel", label: "Cancel" },
        ],
      },
    ]);
    expect(fake.settingsOpened).toBe(0);
  });

  it("on Linux, which has no one place to choose a browser, offers Copy Link and OK alone", async () => {
    const { fake, browser } = setup("linux");

    fake.isDefault = true;
    await browser.open(LINK);

    expect(
      fake.asked.map(({ detail, buttons }) => ({ detail, buttons }))
    ).toStrictEqual([
      {
        detail:
          "Links can't leave Meru while it's your default browser. Choose another default browser in your system settings to open them.",
        buttons: [
          { choice: "copy", label: "Copy Link" },
          { choice: "cancel", label: "OK" },
        ],
      },
    ]);
  });

  it("logs a settings pane that would not open, and still opens nothing", async () => {
    const { fake, defaultBrowser, browser, opened, logged } = setup();

    fake.isDefault = true;
    fake.answer = "settings";
    defaultBrowser.openSettings = () => Promise.reject(new Error("refused"));
    await browser.open(LINK);

    expect([opened, logged]).toStrictEqual([
      [],
      ["The default browser alert's settings failed: refused"],
    ]);
  });
});
