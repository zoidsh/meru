import { describe, expect, it } from "vitest";

import type { KeyInput } from "../../core/engines/shortcuts.ts";
import { ok } from "../../core/result.ts";
import { commandsOf, defineCommands } from "../../shared/commands/define.ts";
import { msg } from "../../shared/msg.ts";
import { strictLog } from "../../test/fakes/log.ts";
import { FakeViewFactory } from "../../test/fakes/view-factory.ts";
import { FakeWindow } from "../../test/fakes/window.ts";
import { testApp } from "../testing.ts";
import { CommandDispatcher } from "./commands.ts";
import { ShortcutKeys } from "./keys.ts";

const fixture = defineCommands(
  "page",
  {
    close: { label: msg`Close page`, shortcut: { default: "Escape" } },
    split: {
      label: msg`Split`,
      menu: { order: 1, section: "view" },
      shortcut: { default: "CmdOrCtrl+Alt+N" },
    },
  },
  { label: msg`Page`, order: 0 }
);

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

const setup = async () => {
  const { settings } = await testApp();
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
    log: strictLog,
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
  it("lets a key through to the page while its command's when is false", async () => {
    const { pane, window, ran } = await setup();
    expect(pane.press(key("Escape", "Escape"))).toBeFalsy();
    expect(window.press(key("Escape", "Escape"))).toBeFalsy();
    expect(ran).toStrictEqual([]);
  });

  it("keeps the key from the page and runs the command for the page's window once it can run", async () => {
    const { pane, window, ran, open } = await setup();
    open();
    expect(pane.press(key("Escape", "Escape"))).toBeTruthy();
    expect(ran).toStrictEqual([`close ${window.contentsId}`]);
  });

  it("leaves a command with a menu item to the menu", async () => {
    const { pane, ran } = await setup();
    expect(pane.press(key("KeyN", "˜", { alt: true, meta: true }))).toBeFalsy();
    expect(ran).toStrictEqual([]);
  });

  it("hears no page while no command without a menu item has a key", async () => {
    const quiet = defineCommands(
      "quiet",
      { close: { label: msg`Close page` } },
      { label: msg`Quiet`, order: 0 }
    );
    const { settings } = await testApp();
    const dispatcher = new CommandDispatcher<"quiet.close">();
    const keys = new ShortcutKeys({
      commands: commandsOf(quiet),
      dispatcher,
      platform: "darwin",
      log: strictLog,
      settings,
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

  it("stops hearing a page once detached", async () => {
    const { detach, pane, open } = await setup();
    open();
    detach();
    expect(pane.press(key("Escape", "Escape"))).toBeFalsy();
  });
});
