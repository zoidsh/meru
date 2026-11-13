import { describe, expect, it } from "vitest";

import type { KeyInput } from "../../core/engines/shortcuts.ts";
import { ok } from "../../core/result.ts";
import { commandsOf, defineCommands } from "../../shared/commands/define.ts";
import { msg } from "../../shared/msg.ts";
import { FakeClock } from "../../test/fakes/clock.ts";
import { FakeFs } from "../../test/fakes/fs.ts";
import { FakeIpcTransport } from "../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../test/fakes/lifecycle.ts";
import { FakeViewFactory } from "../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { SettingsStore } from "../features/settings/index.ts";
import { CommandDispatcher } from "./commands.ts";
import { IpcDispatcher } from "./ipc.ts";
import { ShortcutKeys } from "./keys.ts";

const rethrow = (error: unknown) => {
  throw error;
};

const fixture = defineCommands("page", {
  close: { label: msg`Close page`, shortcut: { default: "Escape" } },
  split: {
    label: msg`Split`,
    menu: { order: 1, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+N" },
  },
});

const key = (
  code: string,
  name: string,
  modifiers: Partial<Pick<KeyInput, "meta" | "alt" | "shift" | "control">> = {}
): KeyInput => ({
  alt: false,
  code,
  control: false,
  key: name,
  meta: false,
  shift: false,
  type: "keyDown",
  ...modifiers,
});

const setup = () => {
  const settings = new SettingsStore({
    lifecycle: new FakeLifecycle(),
    clock: new FakeClock(),
    fs: new FakeFs(),
    onError: rethrow,
    onFallback: rethrow,
    registrar: new IpcDispatcher({
      onError: rethrow,
      transport: new FakeIpcTransport(),
    }),
    watchFile: false,
  });
  const dispatcher = new CommandDispatcher<"page.close" | "page.split">();
  // Escape closes a page only in a window that has one open, as the settings page will.
  const open = new Set<number>();
  const ran: string[] = [];
  dispatcher.register(fixture, {
    close: {
      run: ({ windowId }) => {
        ran.push(`close ${windowId}`);
        return ok(null);
      },
      when: ({ windowId }) => windowId !== null && open.has(windowId),
    },
    split: () => {
      ran.push("split");
      return ok(null);
    },
  });
  const keys = new ShortcutKeys({
    commands: commandsOf(fixture),
    dispatcher,
    platform: "darwin",
    report: rethrow,
    settings,
  });
  keys.start();
  const window = new FakeWindow();
  const pane = new FakeViewFactory().create({
    background: "#ffffff",
    radius: 0,
    zoom: 1,
  });
  keys.attach(window, window.contentsId);
  const detach = keys.attach(pane, window.contentsId);
  return {
    detach,
    open: () => {
      open.add(window.contentsId);
    },
    pane,
    ran,
    settings,
    window,
  };
};

describe(ShortcutKeys, () => {
  it("lets a key through to the page while its command's when is false", () => {
    const { pane, window, ran } = setup();
    expect(pane.press(key("Escape", "Escape"))).toBeFalsy();
    expect(window.press(key("Escape", "Escape"))).toBeFalsy();
    expect(ran).toStrictEqual([]);
  });

  it("keeps the key from the page and runs the command for the page's window once it can run", () => {
    const { pane, window, ran, open } = setup();
    open();
    expect(pane.press(key("Escape", "Escape"))).toBeTruthy();
    expect(ran).toStrictEqual([`close ${window.contentsId}`]);
  });

  it("leaves a command with a menu item to the menu", () => {
    const { pane, ran } = setup();
    expect(pane.press(key("KeyN", "˜", { alt: true, meta: true }))).toBeFalsy();
    expect(ran).toStrictEqual([]);
  });

  it("hears no page while no command without a menu item has a key", () => {
    const quiet = defineCommands("quiet", {
      close: { label: msg`Close page` },
    });
    const dispatcher = new CommandDispatcher<"quiet.close">();
    const keys = new ShortcutKeys({
      commands: commandsOf(quiet),
      dispatcher,
      platform: "darwin",
      report: rethrow,
      settings: setup().settings,
    });
    keys.start();
    const pane = new FakeViewFactory().create({
      background: "#ffffff",
      radius: 0,
      zoom: 1,
    });
    keys.attach(pane, 1);
    expect(pane.listening).toBeFalsy();
  });

  it("stops hearing a page once detached", () => {
    const { detach, pane, open } = setup();
    open();
    detach();
    expect(pane.press(key("Escape", "Escape"))).toBeFalsy();
  });
});
