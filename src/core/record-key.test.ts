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
  // What Chromium on macOS gives with Option held, Command or not.
  "US with Option": [
    ["KeyK", "˚", ""],
    ["KeyN", "Dead", "˜"],
    ["KeyE", "Dead", "´"],
    ["KeyA", "å", "Å"],
    ["Digit1", "¡", "⁄"],
    ["Digit2", "™", "€"],
    ["Minus", "–", "—"],
    ["BracketLeft", "“", "”"],
    ["Comma", "≤", "¯"],
    ["Period", "≥", "˘"],
    ["Slash", "÷", "¿"],
    ["Semicolon", "…", "Ú"],
    ["Quote", "æ", "Æ"],
    ["Backslash", "«", "»"],
    ["Backquote", "Dead", "`"],
  ],
  "AZERTY with Option": [
    ["KeyQ", "æ", "Æ"],
    ["KeyA", "‡", "Ω"],
    ["KeyM", "∞", "¿"],
    ["Semicolon", "µ", "Ó"],
    ["Digit1", "", "´"],
    ["BracketLeft", "ô", "Ô"],
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

/** With Option and Command held, on macOS. */
const option = (key: string, code: string, shift = false): PressedKey => ({
  key,
  code,
  control: false,
  shift,
  alt: true,
  meta: true,
});

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
      // Option changes what a key types on macOS alone.
      for (const isMacOS of layout.includes("Option")
        ? [true]
        : [true, false]) {
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

  it("names a key Option changes on macOS by where it is on a US keyboard, as the matcher hears it", () => {
    // As Chromium on macOS gives them, Option applied though Command is held.
    const presses = [
      option("˚", "KeyK"),
      option("Dead", "KeyN"),
      option("¡", "Digit1"),
      option("“", "BracketLeft"),
      option("≥", "Period"),
      option("÷", "Slash"),
      option("Ò", "KeyL", true),
      // German ⌥L types @.
      option("@", "KeyL"),
      // French AZERTY ⌥A, where US has Q: Option names it by US place.
      option("æ", "KeyQ"),
    ];
    const recorded = presses.map((pressed) => recordKey(pressed, true));

    expect(recorded).toStrictEqual(
      [
        "Alt+Command+K",
        "Alt+Command+N",
        "Alt+Command+1",
        "Alt+Command+[",
        "Alt+Command+.",
        "Alt+Command+/",
        "Alt+Shift+Command+L",
        "Alt+Command+L",
        "Alt+Command+Q",
      ].map((accelerator) => ({ kind: "key", accelerator }))
    );
    expect(
      presses.every((pressed, index) => {
        const result = recorded[index];

        return (
          result?.kind === "key" &&
          matchesAccelerator(result.accelerator, asInput(pressed), true)
        );
      })
    ).toBeTruthy();
    // Split Right's default, which Option otherwise turns into a dead key.
    expect(
      matchesAccelerator("Command+Alt+N", asInput(option("Dead", "KeyN")), true)
    ).toBeTruthy();
  });

  it("keeps the character Alt or AltGr types off macOS, and names a letter of another script by where it is", () => {
    expect([
      recordKey(
        {
          key: "ù",
          code: "Quote",
          control: false,
          shift: false,
          alt: true,
          meta: false,
        },
        false
      ),
      withControl("к", "KeyR"),
      withControl(",", "KeyM"),
      withControl("m", "Semicolon"),
      // AltGr on Polish, which reports Ctrl+Alt and types ą.
      recordKey(
        {
          key: "ą",
          code: "KeyA",
          control: true,
          shift: false,
          alt: true,
          meta: false,
        },
        false
      ),
    ]).toStrictEqual([
      { kind: "refused" },
      { kind: "key", accelerator: "Control+R" },
      { kind: "key", accelerator: "Control+," },
      { kind: "key", accelerator: "Control+M" },
      { kind: "refused" },
    ]);
    expect(
      matchesAccelerator(
        "Control+Alt+A",
        asInput({
          key: "ą",
          code: "KeyA",
          control: true,
          shift: false,
          alt: true,
          meta: false,
        }),
        false
      )
    ).toBeFalsy();
  });

  it("refuses a dead key, a character no accelerator names and, off macOS, the Windows key, recording nothing", () => {
    const refused = [
      { key: "Dead", code: "BracketLeft" },
      { key: "ö", code: "Semicolon" },
      { key: "ù", code: "Quote" },
      { key: "Unidentified", code: "" },
      { key: "Process", code: "KeyA" },
    ].map((pressed) =>
      recordKey(
        { control: true, shift: false, alt: false, meta: false, ...pressed },
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
