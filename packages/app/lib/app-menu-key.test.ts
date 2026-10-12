import { describe, expect, test } from "bun:test";
import { type AppMenuKeyState, readAppMenuKey } from "./app-menu-key";

function press(key: string, overrides: Partial<Parameters<typeof readAppMenuKey>[1]> = {}) {
  return {
    type: "keyDown",
    key,
    control: false,
    shift: false,
    meta: false,
    isAutoRepeat: false,
    ...overrides,
  };
}

function release(key: string, overrides: Partial<Parameters<typeof readAppMenuKey>[1]> = {}) {
  return press(key, { ...overrides, type: "keyUp" });
}

/** Feeds a whole sequence and says whether the menu opened, and how often. */
function run(inputs: Array<ReturnType<typeof press>>) {
  let state: AppMenuKeyState = "idle";
  let opened = 0;

  for (const input of inputs) {
    const result = readAppMenuKey(state, input);
    state = result.state;
    if (result.opensMenu) {
      opened += 1;
    }
  }

  return opened;
}

describe("readAppMenuKey", () => {
  test("a bare Alt, pressed and released, opens the menu", () => {
    expect(run([press("Alt"), release("Alt")])).toBe(1);
  });

  test("F10 on its own opens the menu", () => {
    expect(run([press("F10"), release("F10")])).toBe(1);
  });

  test("Alt+Tab leaves it alone", () => {
    expect(run([press("Alt"), press("Tab"), release("Tab"), release("Alt")])).toBe(0);
  });

  test("an Alt+key shortcut leaves it alone", () => {
    expect(run([press("Alt"), press("f"), release("f"), release("Alt")])).toBe(0);
  });

  test("the Ctrl+Alt that AltGr sends leaves it alone", () => {
    expect(
      run([
        press("Control"),
        press("Alt", { control: true }),
        press("@", { control: true }),
        release("@", { control: true }),
        release("Alt", { control: true }),
        release("Control"),
      ]),
    ).toBe(0);
  });

  test("Alt held down to repeat is not a tap", () => {
    expect(run([press("Alt"), press("Alt", { isAutoRepeat: true }), release("Alt")])).toBe(0);
  });

  test("Shift+Alt and Alt with a meta key are not a tap", () => {
    expect(run([press("Alt", { shift: true }), release("Alt", { shift: true })])).toBe(0);
    expect(run([press("Alt", { meta: true }), release("Alt", { meta: true })])).toBe(0);
  });

  test("Shift+F10, the context-menu key, is not F10", () => {
    expect(run([press("F10", { shift: true }), release("F10", { shift: true })])).toBe(0);
  });

  test("a release with nothing held opens nothing", () => {
    expect(run([release("Alt")])).toBe(0);
  });

  test("rawKeyDown is ignored, so a press is never counted twice", () => {
    expect(run([{ ...press("Alt"), type: "rawKeyDown" }, press("Alt"), release("Alt")])).toBe(1);
  });

  test("two taps open it twice", () => {
    expect(run([press("Alt"), release("Alt"), press("Alt"), release("Alt")])).toBe(2);
  });
});
