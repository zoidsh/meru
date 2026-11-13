import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { themeOf } from "../../core/ports.ts";
import type { WindowSpec } from "../../core/ports.ts";
import { wireName } from "../../shared/channels/define.ts";
import { settingsPushes } from "../../shared/channels/settings.ts";
import { themePushes } from "../../shared/channels/theme.ts";
import { FakeIpcTransport } from "../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../test/fakes/lifecycle.ts";
import { FakeTheme } from "../../test/fakes/theme.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { IpcDispatcher } from "./ipc.ts";
import { MainWindow } from "./window.ts";

const open = async (platform: string, devServer?: string) => {
  const theme = new FakeTheme(true);
  const window = new FakeWindow();
  const specs: WindowSpec[] = [];
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({
    onError: (error) => {
      throw error;
    },
    transport,
  });
  await new MainWindow({
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
      theme: () => themeOf(theme),
    },
    preload: "/preload.cjs",
    registrar,
    surface: "chrome",
  }).show();
  return { registrar, specs, theme, transport, window };
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

  it("names the chrome page's surface to its preload and allows it that surface's channels", async () => {
    const { registrar, specs, transport, window } = await open("darwin");
    expect(specs[0]?.arguments).toStrictEqual(["--meru-surface=chrome"]);
    transport.sent.length = 0;
    registrar.broadcast(settingsPushes.changed, { changes: [] });
    expect(transport.sent.map((sent) => sent.contentsId)).toStrictEqual([
      window.contentsId,
    ]);
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

  it("tells the chrome page the theme changed, so it recolours with the window", async () => {
    const { theme, transport, window } = await open("darwin");
    theme.set(false);
    theme.set(true);
    expect(
      transport.sent.filter(
        (sent) =>
          sent.contentsId === window.contentsId &&
          sent.channel === wireName(themePushes.changed)
      )
    ).toStrictEqual([
      {
        channel: wireName(themePushes.changed),
        contentsId: window.contentsId,
        payload: { theme: "light" },
      },
      {
        channel: wireName(themePushes.changed),
        contentsId: window.contentsId,
        payload: { theme: "dark" },
      },
    ]);
  });
});
