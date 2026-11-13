import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import type { WindowSpec } from "../../core/ports.ts";
import { FakeLifecycle } from "../../test/fakes/lifecycle.ts";
import { FakeTheme } from "../../test/fakes/theme.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { MainWindow } from "./window.ts";

const open = async (platform: string, devServer?: string) => {
  const theme = new FakeTheme(true);
  const window = new FakeWindow();
  const specs: WindowSpec[] = [];
  await new MainWindow({
    arguments: [],
    background: true,
    bounds: { height: 800, width: 1200, x: 0, y: 0 },
    linuxControls: false,
    onCreated: () => {
      // The test reads the window from the factory.
    },
    ports: {
      lifecycle: new FakeLifecycle(platform),
      theme,
      windows: {
        create: (spec) => {
          specs.push(spec);
          return window;
        },
      },
    },
    pages: {
      devServer,
      dir: "/dist/renderer",
      platform,
      theme: () => (theme.dark() ? "dark" : "light"),
    },
    preload: "/preload.cjs",
  }).show();
  return { specs, theme, window };
};

describe(MainWindow, () => {
  it("opens with the chrome's ground and tells the page its platform and theme", async () => {
    const { specs, window } = await open("darwin");
    expect(specs[0]?.background).toBe("#1d1d24");
    expect(specs[0]?.titleBar.style).toBe("hiddenInset");
    expect(window.loaded).toBe(
      `${pathToFileURL(path.join("/dist/renderer", "chrome.html")).href}?platform=darwin&theme=dark`
    );
    expect(window.shown).toBe("inactive");
  });

  it("puts the same in the dev server's URL", async () => {
    const { window } = await open("darwin", "http://127.0.0.1:5173/");
    expect(window.loaded).toBe(
      "http://127.0.0.1:5173/chrome.html?platform=darwin&theme=dark"
    );
  });

  it("recolours the window controls when the theme changes", async () => {
    const { theme, window } = await open("win32");
    theme.set(false);
    expect(window.background).toBe("#ececf1");
    expect(window.overlay?.color).toBe("#ececf1");
    expect(window.overlay?.symbolColor).toBe("#2a2a30");
  });
});
