import { describe, expect, it } from "vitest";

import { isRecordable, matchesAccelerator, recordKey } from "./accelerator.ts";
import type { PressedKey } from "./accelerator.ts";

/** A key by where it is, what it types, and what it types with Shift. */
type LayoutKey = readonly [code: string, key: string, shifted: string];

const letters = (map: Record<string, string> = {}): LayoutKey[] =>
  [..."abcdefghijklmnopqrstuvwxyz"].map((letter) => {
    const code = `Key${letter.toUpperCase()}`;
    const typed = map[code] ?? letter;

    return [code, typed, typed.toUpperCase()];
  });

const NAMED: LayoutKey[] = [
  ["ArrowLeft", "ArrowLeft", "ArrowLeft"],
  ["ArrowDown", "ArrowDown", "ArrowDown"],
  ["Enter", "Enter", "Enter"],
  ["Space", " ", " "],
  ["Home", "Home", "Home"],
  ["PageDown", "PageDown", "PageDown"],
  ["F5", "F5", "F5"],
  ["F12", "F12", "F12"],
  ["Numpad1", "1", "1"],
  ["NumpadAdd", "+", "+"],
];

/** As Chromium names each key's `key` on these layouts. */
const LAYOUTS: Record<string, LayoutKey[]> = {
  US: [
    ...letters(),
    ..."1234567890"
      .split("")
      .map((digit, index): LayoutKey => [
        `Digit${digit}`,
        digit,
        "!@#$%^&*()"[index] ?? "",
      ]),
    ["Minus", "-", "_"],
    ["Equal", "=", "+"],
    ["BracketLeft", "[", "{"],
    ["BracketRight", "]", "}"],
    ["Backslash", "\\", "|"],
    ["Semicolon", ";", ":"],
    ["Quote", "'", '"'],
    ["Comma", ",", "<"],
    ["Period", ".", ">"],
    ["Slash", "/", "?"],
    ["Backquote", "`", "~"],
    ...NAMED,
  ],
  AZERTY: [
    ...letters({
      KeyQ: "a",
      KeyA: "q",
      KeyW: "z",
      KeyZ: "w",
      KeyM: ",",
    }).filter(([code]) => code !== "KeyM"),
    ["KeyM", ",", "?"],
    ["Semicolon", "m", "M"],
    ["Digit1", "&", "1"],
    ["Digit2", "é", "2"],
    ["Digit3", '"', "3"],
    ["Digit4", "'", "4"],
    ["Digit5", "(", "5"],
    ["Digit6", "-", "6"],
    ["Digit7", "è", "7"],
    ["Digit8", "_", "8"],
    ["Digit9", "ç", "9"],
    ["Digit0", "à", "0"],
    ["Minus", ")", "°"],
    ["Equal", "=", "+"],
    ["BracketLeft", "Dead", "Dead"],
    ["BracketRight", "$", "£"],
    ["Comma", ";", "."],
    ["Period", ":", "/"],
    ["Slash", "!", "§"],
    ["Quote", "ù", "%"],
    ["Backslash", "*", "µ"],
    ["Backquote", "²", "²"],
    ...NAMED,
  ],
  QWERTZ: [
    ...letters({ KeyY: "z", KeyZ: "y" }),
    ["Digit1", "1", "!"],
    ["Digit2", "2", '"'],
    ["Digit3", "3", "§"],
    ["Digit6", "6", "&"],
    ["Digit7", "7", "/"],
    ["Digit0", "0", "="],
    ["Minus", "ß", "?"],
    ["Equal", "Dead", "Dead"],
    ["BracketLeft", "ü", "Ü"],
    ["BracketRight", "+", "*"],
    ["Semicolon", "ö", "Ö"],
    ["Quote", "ä", "Ä"],
    ["Backslash", "#", "'"],
    ["Comma", ",", ";"],
    ["Period", ".", ":"],
    ["Slash", "-", "_"],
    ["Backquote", "Dead", "°"],
    ...NAMED,
  ],
};

const MODIFIERS = ["control", "alt", "shift", "meta"] as const;

type Held = Pick<PressedKey, (typeof MODIFIERS)[number]>;

/** Every set of modifiers, none first. */
const HELD = [false, true].flatMap((control) =>
  [false, true].flatMap((alt) =>
    [false, true].flatMap((shift) =>
      [false, true].map((meta): Held => ({ control, alt, shift, meta }))
    )
  )
);

/** With Control held, off macOS. */
const withControl = (key: string, code: string, shift = false) =>
  recordKey(
    { key, code, control: true, shift, alt: false, meta: false },
    false
  );

/** With nothing held but Shift, on macOS. */
const bare = (key: string, code: string, shift = false) =>
  recordKey(
    { key, code, control: false, shift, alt: false, meta: false },
    true
  );

/** What it asks for, alone or with Control, off macOS. */
const kindOf = (key: string, control = false) =>
  recordKey(
    { key, code: key, control, shift: false, alt: false, meta: false },
    false
  ).kind;

const pressesOf = (layout: LayoutKey[]) =>
  layout.flatMap(([code, key, shifted]) =>
    HELD.map((held): PressedKey => ({
      code,
      key: held.shift ? shifted : key,
      ...held,
    }))
  );

const asInput = (pressed: PressedKey) => ({
  ...pressed,
  type: "keyDown",
  isAutoRepeat: false,
});

describe(recordKey, () => {
  it.each(Object.keys(LAYOUTS))(
    "records on %s only what the matcher then hears from the same key, on macOS and elsewhere",
    (layout) => {
      for (const isMacOS of [true, false]) {
        const presses = pressesOf(LAYOUTS[layout] ?? []);
        const recordedCount = presses.filter(
          (pressed) => recordKey(pressed, isMacOS).kind === "key"
        ).length;
        const unheard = presses.flatMap((pressed) => {
          const recorded = recordKey(pressed, isMacOS);

          return recorded.kind === "key" &&
            !(
              matchesAccelerator(
                recorded.accelerator,
                asInput(pressed),
                isMacOS
              ) && isRecordable(recorded.accelerator, isMacOS)
            )
            ? [`${pressed.code} ${pressed.key} ${recorded.accelerator}`]
            : [];
        });

        expect(unheard).toStrictEqual([]);
        // Most keys with a modifier record: the property is not empty.
        expect(recordedCount).toBeGreaterThan(presses.length / 4);
      }
    }
  );

  it("names a letter by what it types, and punctuation and digits by where they are, as the matcher hears them", () => {
    expect([
      withControl("a", "KeyQ"),
      withControl("Z", "KeyY", true),
      withControl("&", "Digit1"),
      withControl("1", "Digit1", true),
      withControl(";", "Comma"),
      withControl(",", "KeyM"),
      withControl("ß", "Minus"),
      withControl("+", "Equal", true),
      withControl(":", "Semicolon", true),
      withControl(" ", "Space"),
      withControl("ArrowLeft", "ArrowLeft"),
    ]).toStrictEqual(
      [
        "Control+A",
        "Control+Shift+Z",
        "Control+1",
        "Control+Shift+1",
        "Control+,",
        "Control+,",
        "Control+-",
        "Control+Shift+=",
        "Control+Shift+:",
        "Control+Space",
        "Control+Left",
      ].map((accelerator) => ({ kind: "key", accelerator }))
    );
  });

  it("refuses a dead key, a character no accelerator names and, off macOS, the Windows key, recording nothing", () => {
    const refused = [
      { key: "Dead", code: "BracketLeft", control: true },
      { key: "Dead", code: "KeyN", meta: true, alt: true },
      { key: "ö", code: "Semicolon", control: true },
      { key: "ù", code: "Quote", alt: true },
      { key: "Unidentified", code: "", control: true },
      { key: "Process", code: "KeyA", control: true },
    ].map((pressed) =>
      recordKey(
        { control: false, shift: false, alt: false, meta: false, ...pressed },
        true
      )
    );

    expect(refused.every(({ kind }) => kind === "refused")).toBeTruthy();
    expect(
      recordKey(
        {
          key: "k",
          code: "KeyK",
          control: true,
          shift: false,
          alt: false,
          meta: true,
        },
        false
      )
    ).toStrictEqual({ kind: "refused" });
  });

  it("asks for ⌘, ⌃ or ⌥, or Ctrl or Alt, unless the key is a function key", () => {
    expect([
      bare("k", "KeyK"),
      bare("K", "KeyK", true),
      bare("Enter", "Enter"),
      bare("F5", "F5"),
      bare("F5", "F5", true),
    ]).toStrictEqual([
      { kind: "needsModifier" },
      { kind: "needsModifier" },
      { kind: "needsModifier" },
      { kind: "key", accelerator: "F5" },
      { kind: "key", accelerator: "Shift+F5" },
    ]);
  });

  it("waits through a modifier alone, cancels on Escape, clears on Backspace or Delete and leaves on Tab, but records Ctrl+Tab", () => {
    expect([
      kindOf("Shift"),
      kindOf("Meta"),
      kindOf("Escape"),
      kindOf("Escape", true),
      kindOf("Backspace"),
      kindOf("Delete", true),
      kindOf("Tab"),
      kindOf("Tab", true),
    ]).toStrictEqual([
      "pending",
      "pending",
      "cancel",
      "cancel",
      "clear",
      "clear",
      "leave",
      "key",
    ]);
  });
});

describe(isRecordable, () => {
  it("reads what the recorder records, and refuses a key it never would", () => {
    expect([
      isRecordable("Control+Shift+R", true),
      isRecordable("Command+,", true),
      isRecordable("F5", false),
      isRecordable("CommandOrControl+Shift+W", false),
      isRecordable("Shift+R", false),
      isRecordable("R", true),
      isRecordable("Super+R", false),
      isRecordable("Control+ö", false),
      isRecordable("Hyper+R", true),
      isRecordable("Control+", true),
    ]).toStrictEqual([
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});
