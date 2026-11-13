import { describe, expect, it } from "vitest";

import { themeOf } from "../../core/ports.ts";
import type { WindowSpec } from "../../core/ports.ts";
import { settingsPushes } from "../../shared/channels/settings.ts";
import { FakeDisplays } from "../../test/fakes/display.ts";
import { FakeIpcTransport } from "../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../test/fakes/lifecycle.ts";
import { FakeTheme } from "../../test/fakes/theme.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { IpcDispatcher } from "./ipc.ts";
import { SettingsWindow } from "./settings-window.ts";

const setup = (platform = "darwin") => {
  const theme = new FakeTheme(false);
  const created: FakeWindow[] = [];
  const specs: WindowSpec[] = [];
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({
    onError: (error) => {
      throw error;
    },
    transport,
  });
  const settings = new SettingsWindow({
    background: false,
    linuxControls: false,
    pages: {
      devServer: undefined,
      dir: "/dist/renderer",
      platform,
      theme: () => themeOf(theme),
    },
    ports: {
      displays: new FakeDisplays(),
      lifecycle: new FakeLifecycle(platform),
      theme,
      windows: {
        create: (spec) => {
          specs.push(spec);
          const window = new FakeWindow();
          created.push(window);
          return window;
        },
      },
    },
    preload: "/preload.cjs",
    registrar,
  });
  const reached = () => {
    transport.sent.length = 0;
    registrar.broadcast(settingsPushes.changed, { changes: [] });
    return transport.sent.map((sent) => sent.contentsId);
  };
  return { created, reached, settings, specs };
};

describe(SettingsWindow, () => {
  it("opens one window at 3.x's size on the primary display, its page on the settings surface", async () => {
    const { created, reached, settings, specs } = setup();
    await settings.open();
    const [window] = created;
    expect({
      arguments: specs[0]?.arguments,
      bounds: specs[0]?.bounds,
      loaded: window?.loaded?.replace(/^.*\//u, ""),
      reached: reached(),
      shown: window?.shown,
    }).toStrictEqual({
      arguments: ["--meru-surface=settings"],
      bounds: { height: 720, width: 1000, x: 460, y: 192 },
      loaded: "settings.html?platform=darwin&theme=light",
      reached: [window?.contentsId],
      shown: "active",
    });
  });

  it("brings the open window to the front rather than opening another, and opens a new one once it has closed, the old one's page refused", async () => {
    const { created, reached, settings } = setup();
    await settings.open();
    const [first] = created;
    if (first !== undefined) {
      first.shown = undefined;
    }
    await settings.open();
    const again = { count: created.length, shown: first?.shown };
    first?.close();
    await settings.open();
    expect({
      again,
      count: created.length,
      reached: reached(),
    }).toStrictEqual({
      again: { count: 1, shown: "active" },
      count: 2,
      reached: [created[1]?.contentsId],
    });
  });

  it("recolours its ground and its window controls in another theme", async () => {
    const { created, settings } = setup("win32");
    await settings.open();
    settings.recolour("dark");
    expect([created[0]?.background, created[0]?.overlay?.color]).toStrictEqual([
      "#1d1d24",
      "#1d1d24",
    ]);
  });
});
