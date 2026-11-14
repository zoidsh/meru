import { describe, expect, it, vi } from "vitest";

import { themeOf } from "../../../core/ports.ts";
import { wireName } from "../../../shared/channels/define.ts";
import { settingsPushes } from "../../../shared/channels/settings.ts";
import { shortcuts } from "../../../shared/channels/shortcuts.ts";
import { FakeDisplays } from "../../../test/fakes/display.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { strictLog } from "../../../test/fakes/log.ts";
import { FakeTheme } from "../../../test/fakes/theme.ts";
import { FakeWindows } from "../../../test/fakes/window-factory.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { pageUrl } from "../../shell/window.ts";
import { SettingsWindow } from "./window.ts";

const setup = (platform = "darwin") => {
  const theme = new FakeTheme(false);
  const windows = new FakeWindows();
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({
    log: strictLog,
    transport,
  });
  const commands = new CommandDispatcher();
  const pages = {
    devServer: undefined,
    dir: "/dist/renderer",
    platform,
    theme: () => themeOf(theme),
  };
  const settings = new SettingsWindow({
    background: false,
    commands,
    linuxControls: false,
    log: strictLog,
    ports: {
      displays: new FakeDisplays(),
      lifecycle: new FakeLifecycle(platform),
      theme,
      windows,
    },
    preload: "/preload.cjs",
    registrar,
    url: () => pageUrl(pages, "settings.html"),
  });
  settings.start();
  const reached = () => {
    transport.sent.length = 0;
    registrar.broadcast(settingsPushes.changed, { changes: [], locked: {} });
    return transport.sent.map((sent) => sent.contentsId);
  };
  return {
    commands,
    created: windows.created,
    reached,
    registrar,
    settings,
    specs: windows.specs,
  };
};

describe(SettingsWindow, () => {
  it("opens one window at 3.x's size on the primary display on settings.open, its page on the settings surface", async () => {
    const { commands, created, reached, specs } = setup();
    commands.run("settings.open", { windowId: 1 });
    await vi.waitFor(() => {
      expect(created[0]?.shown).toBeDefined();
    });
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

  it("keeps the menu's shortcuts from its page while the shortcuts page records one", async () => {
    const { created, registrar, settings } = setup();
    await settings.open();
    const [window] = created;
    const record = (recording: boolean) =>
      registrar.dispatch(
        window?.contentsId ?? 0,
        wireName(shortcuts.recording),
        {
          recording,
        }
      ).ok;
    const started = [record(true), window?.ignoresMenuShortcuts];
    expect([
      ...started,
      record(false),
      window?.ignoresMenuShortcuts,
    ]).toStrictEqual([true, true, true, false]);
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
