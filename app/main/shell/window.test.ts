import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { themeOf } from "../../core/ports.ts";
import type { WindowSpec } from "../../core/ports.ts";
import { settingsPushes } from "../../shared/channels/settings.ts";
import { FakeIpcTransport } from "../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../test/fakes/lifecycle.ts";
import { strictLog } from "../../test/fakes/log.ts";
import { FakeTheme } from "../../test/fakes/theme.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { IpcDispatcher } from "./ipc.ts";
import { isPageUrl, MainWindow, pageUrl } from "./window.ts";

const open = async (platform: string, devServer?: string) => {
  const theme = new FakeTheme(true);
  const window = new FakeWindow();
  const specs: WindowSpec[] = [];
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({
    log: strictLog,
    transport,
  });
  const main = new MainWindow({
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
  });
  await main.show();
  return { main, registrar, specs, theme, transport, window };
};

describe(MainWindow, () => {
  it("hides and reveals the window, telling each listener the window's visibility as it changes", async () => {
    const { main } = await open("win32");
    const heard: boolean[] = [];
    main.onVisibilityChanged(() => {
      heard.push(main.visible());
    });
    main.hide();
    main.hide();
    main.reveal();
    expect(heard).toStrictEqual([false, true]);
  });

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
    registrar.broadcast(settingsPushes.changed, { changes: [], locked: {} });
    expect(transport.sent.map((sent) => sent.contentsId)).toStrictEqual([
      window.contentsId,
    ]);
  });

  it("takes the chrome page's surface back once the window closes", async () => {
    const { registrar, transport, window } = await open("darwin");
    window.close();
    transport.sent.length = 0;
    registrar.broadcast(settingsPushes.changed, { changes: [], locked: {} });
    expect(transport.sent).toStrictEqual([]);
  });

  it("puts the same in the dev server's URL", async () => {
    const { window } = await open("darwin", "http://127.0.0.1:5173/");
    expect(window.loaded).toBe(
      "http://127.0.0.1:5173/chrome.html?platform=darwin&theme=dark"
    );
  });

  it("recolours the window and its controls in another theme", async () => {
    const { main, window } = await open("win32");
    main.recolour("light");
    expect(window.background).toBe("#ececf1");
    expect(window.overlay?.color).toBe("#ececf1");
    expect(window.overlay?.symbolColor).toBe("#2a2a30");
  });

  it("leaves the traffic lights to macOS", async () => {
    const { main, window } = await open("darwin");
    main.recolour("light");
    expect(window.background).toBe("#ececf1");
    expect(window.overlay).toBeUndefined();
  });
});

describe(isPageUrl, () => {
  it("knows the renderer's own pages, built or served, from anything else", () => {
    const built = {
      devServer: undefined,
      dir: path.join(path.sep, "app", "dist", "renderer"),
      platform: "darwin",
      theme: () => "light" as const,
    };
    const served = { ...built, devServer: "http://localhost:5173/" };
    expect([
      isPageUrl(built, pageUrl(built, "chrome.html")),
      isPageUrl(served, pageUrl(served, "settings.html")),
      isPageUrl(built, "https://mail.google.com/mail/u/0/"),
      isPageUrl(
        built,
        pathToFileURL(
          path.join(path.sep, "app", "dist", "renderer-other", "x.html")
        ).href
      ),
    ]).toStrictEqual([true, true, false, false]);
  });
});
