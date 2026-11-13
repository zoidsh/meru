import { describe, expect, it } from "vitest";

import type { KeyInput } from "../../core/engines/shortcuts.ts";
import { ok } from "../../core/result.ts";
import { commandsOf, defineCommands } from "../../shared/commands/define.ts";
import type { ChromePage } from "../../shared/commands/define.ts";
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
  const dispatcher = new CommandDispatcher();
  let page: ChromePage = "none";
  const ran: string[] = [];
  dispatcher.provide((windowId) => ({
    focusedPaneId: null,
    page,
    windowId: windowId ?? -1,
  }));
  dispatcher.register(fixture, {
    close: {
      run: ({ windowId }) => {
        ran.push(`close ${windowId}`);
        return ok(null);
      },
      when: (context) => context.page !== "none",
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
  const pane = new FakeViewFactory().create({ radius: 0, zoom: 1 });
  keys.attach(window, () => window.contentsId);
  keys.attach(pane, () => window.contentsId);
  return {
    ran,
    pane,
    show: (shown: ChromePage) => {
      page = shown;
    },
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
    const { pane, window, ran, show } = setup();
    show("settings");
    expect(pane.press(key("Escape", "Escape"))).toBeTruthy();
    expect(ran).toStrictEqual([`close ${window.contentsId}`]);
  });

  it("leaves a command with a menu item to the menu", () => {
    const { pane, ran } = setup();
    expect(pane.press(key("KeyN", "˜", { alt: true, meta: true }))).toBeFalsy();
    expect(ran).toStrictEqual([]);
  });
});
