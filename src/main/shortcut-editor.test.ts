import { describe, expect, it } from "vitest";

import { createInitialSettings } from "#core/settings.ts";

import { COMMANDS } from "./commands.ts";
import { createKeymap } from "./keymap.ts";
import { createSettingsStore } from "./settings.ts";
import { createShortcutEditor } from "./shortcut-editor.ts";

type Event = "blur" | "hide" | "closed" | "pageGone";

const fakeWindow = () => {
  const listeners = new Map<Event, (() => void)[]>();
  const add = (event: Event, listener: () => void) => {
    listeners.set(event, [...(listeners.get(event) ?? []), listener]);
  };
  let visible = true;

  return {
    isVisible: () => visible,
    /** Hides it, as `hide()` does, before telling. */
    hide: () => {
      visible = false;
    },
    on: (event: string, listener: () => void) => {
      add(event as Event, listener);
    },
    onClosed: (listener: () => void) => {
      add("closed", listener);
    },
    onPageGone: (listener: () => void) => {
      add("pageGone", listener);
    },
    emit: (event: Event) => {
      for (const listener of listeners.get(event) ?? []) {
        listener();
      }
    },
  };
};

const setup = ({ pro = true } = {}) => {
  const settings = createSettingsStore({
    initial: createInitialSettings(),
    save: () => Promise.resolve(),
    platform: "darwin",
    log: () => {},
    can: (capability) => pro || capability !== "shortcutCustomization",
  });
  const keymap = createKeymap({
    platform: "darwin",
    appName: "Meru",
    commands: COMMANDS,
    settings,
  });
  const ignored: boolean[] = [];
  const editor = createShortcutEditor({
    platform: "darwin",
    keymap,
    can: (capability) => pro || capability !== "shortcutCustomization",
    ignoreMenuShortcuts: (ignore) => {
      ignored.push(ignore);
    },
  });
  const window = fakeWindow();
  editor.follow(window);

  return { editor, keymap, ignored, window };
};

describe(createShortcutEditor, () => {
  it("keeps the menu from hearing keys while a key is recorded", () => {
    const { editor, ignored } = setup();

    editor.record("tab.reload");

    expect(editor.recording()).toBe("tab.reload");
    expect(ignored).toStrictEqual([true]);

    editor.record(null);

    expect(editor.recording()).toBeNull();
    expect(ignored).toStrictEqual([true, false]);
  });

  it.each<Event>(["blur", "hide", "closed", "pageGone"])(
    "stops recording, the menu hearing keys again, on the window's %s",
    (event) => {
      const { editor, ignored, window } = setup();

      editor.record("tab.reload");

      if (event === "hide") {
        window.hide();
      }

      window.emit(event);

      expect(editor.recording()).toBeNull();
      expect(ignored.at(-1)).toBeFalsy();
    }
  );

  it("keeps recording when macOS says hide for a window others cover, which stays visible", () => {
    const { editor, ignored, window } = setup();

    editor.record("tab.reload");
    window.emit("hide");

    expect(editor.recording()).toBe("tab.reload");
    expect(ignored).toStrictEqual([true]);
  });

  it("stops recording when a key is set, even one refused", async () => {
    const { editor, keymap, ignored } = setup();

    editor.record("tab.reload");

    await expect(editor.set("tab.reload", "Command+,")).resolves.toBe(
      "⌘, is already used for Settings."
    );
    expect(editor.recording()).toBeNull();
    expect(ignored.at(-1)).toBeFalsy();

    editor.record("tab.reload");
    await editor.set("tab.reload", "Command+Alt+R");

    expect(editor.recording()).toBeNull();
    expect(keymap.accelerator("tab.reload")).toBe("Command+Alt+R");
  });

  it("stops recording on Reset", async () => {
    const { editor } = setup();

    editor.record("tab.reload");
    await editor.reset("tab.reload");

    expect(editor.recording()).toBeNull();
  });

  it("tells the page of each change of what is recorded, once", () => {
    const { editor } = setup();
    let told = 0;
    editor.onChange(() => {
      told += 1;
    });

    editor.record("tab.reload");
    editor.record("tab.reload");
    editor.record(null);

    expect(told).toBe(2);
  });

  it("refuses a key the recorder never gives", async () => {
    const { editor, keymap } = setup();

    await expect(editor.set("tab.reload", "R")).rejects.toThrow(
      "no key the recorder gives"
    );
    await expect(editor.set("tab.reload", "Command+Ä")).rejects.toThrow(
      "no key the recorder gives"
    );
    expect(keymap.accelerator("tab.reload")).toBe("Control+Shift+R");
  });

  it("records no range's key, and nothing without Meru Pro", () => {
    expect(() => {
      setup().editor.record("profile.select.1");
    }).toThrow("no key to record");
    expect(() => {
      setup({ pro: false }).editor.record("tab.reload");
    }).toThrow("no key to record");
  });
});
