import type { Platform } from "./platform.ts";

/** A key as a view hears it before its page does. */
export interface KeyInput {
  type: string;
  /** The character or name the key gave, such as `w`, `W`, `}` or `Tab`. */
  key: string;
  /** Where the key is on the keyboard, such as `KeyW` or `BracketRight`. */
  code: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  /** Whether the key is held and this press is the system repeating it. */
  isAutoRepeat: boolean;
}

/**
 * Where the punctuation and digits a shortcut names sit, for those that have
 * one; with Shift a digit types its symbol, such as `@` for 2.
 */
const CODES: Record<string, string> = {
  ",": "Comma",
  "-": "Minus",
  "=": "Equal",
  "[": "BracketLeft",
  "]": "BracketRight",
  ...Object.fromEntries(
    Array.from({ length: 10 }, (_, digit) => [`${digit}`, `Digit${digit}`])
  ),
};

const codeOf = (key: string) => CODES[key];

const DIGIT = /^\d$/u;

type Modifier = "control" | "shift" | "alt" | "meta";

const modifierOf = (part: string, isMacOS: boolean): Modifier | undefined => {
  switch (part.toLowerCase()) {
    case "commandorcontrol":
    case "cmdorctrl": {
      return isMacOS ? "meta" : "control";
    }
    case "command":
    case "cmd":
    case "super":
    case "meta": {
      return "meta";
    }
    case "control":
    case "ctrl": {
      return "control";
    }
    case "shift": {
      return "shift";
    }
    case "alt":
    case "option": {
      return "alt";
    }
    default: {
      return undefined;
    }
  }
};

/**
 * Whether a key press is an Electron accelerator such as
 * `CommandOrControl+Shift+W`, with exactly its modifiers. A letter matches by
 * what it typed, so it follows the layout; another key also by where it is,
 * so Shift+] still matches though it types `}`.
 */
export const matchesAccelerator = (
  accelerator: string,
  input: KeyInput,
  isMacOS: boolean
) => {
  if (input.type !== "keyDown") {
    return false;
  }

  const wanted = { control: false, shift: false, alt: false, meta: false };
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";

  for (const part of parts) {
    const modifier = modifierOf(part, isMacOS);

    if (!modifier) {
      return false;
    }

    wanted[modifier] = true;
  }

  const sameModifiers = (["control", "shift", "alt", "meta"] as const).every(
    (modifier) => wanted[modifier] === input[modifier]
  );

  // A digit typed names itself, as on a layout whose digit row types other
  // digits with Shift, where by place it would also match another.
  const byPlace =
    !DIGIT.test(input.key) &&
    codeOf(key) !== undefined &&
    input.code === codeOf(key);

  return (
    sameModifiers && (input.key.toLowerCase() === key.toLowerCase() || byPlace)
  );
};

/** In the order macOS's menus show them. */
const MAC_MODIFIERS = [
  ["control", "⌃"],
  ["alt", "⌥"],
  ["shift", "⇧"],
  ["meta", "⌘"],
] as const;

const OTHER_MODIFIERS = [
  ["control", "Ctrl"],
  ["alt", "Alt"],
  ["shift", "Shift"],
  ["meta", "Super"],
] as const;

/** Named keys as macOS's menus show them, by Electron's name, lower case. */
const MAC_KEYS: Record<string, string> = {
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
  backspace: "⌫",
  delete: "⌦",
  enter: "↩",
  return: "↩",
  escape: "⎋",
  esc: "⎋",
  tab: "⇥",
  space: "Space",
  plus: "+",
};

const OTHER_KEYS: Record<string, string> = { plus: "+" };

/** Named keys as `aria-keyshortcuts` names them, by Electron's name, lower case. */
const ARIA_KEYS: Record<string, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  backspace: "Backspace",
  delete: "Delete",
  enter: "Enter",
  return: "Enter",
  escape: "Escape",
  esc: "Escape",
  tab: "Tab",
  space: "Space",
  plus: "+",
};

const ARIA_MODIFIERS = [
  ["control", "Control"],
  ["alt", "Alt"],
  ["shift", "Shift"],
  ["meta", "Meta"],
] as const;

/**
 * An Electron accelerator as `aria-keyshortcuts` names it on `platform`:
 * `Shift+Meta+W` on macOS for `CommandOrControl+Shift+W`, `Control+Shift+W`
 * elsewhere.
 */
export const ariaKeyShortcut = (accelerator: string, platform: Platform) => {
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const held = new Set(
    parts.map((part) => modifierOf(part, platform === "darwin"))
  );

  return [
    ...ARIA_MODIFIERS.filter(([modifier]) => held.has(modifier)).map(
      ([, name]) => name
    ),
    ARIA_KEYS[key.toLowerCase()] ??
      (key.length === 1 ? key.toUpperCase() : key),
  ].join("+");
};

/** A key of an accelerator: a modifier, or the key it ends with by Electron's name. */
export type AcceleratorKey =
  | { modifier: Modifier }
  | { modifier?: undefined; key: string };

/**
 * An Electron accelerator's keys in the order `platform`'s menus show them,
 * the modifiers first.
 */
export const acceleratorKeys = (
  accelerator: string,
  platform: Platform
): AcceleratorKey[] => {
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const held = new Set(
    parts.map((part) => modifierOf(part, platform === "darwin"))
  );

  return [
    ...(platform === "darwin" ? MAC_MODIFIERS : OTHER_MODIFIERS)
      .filter(([modifier]) => held.has(modifier))
      .map(([modifier]) => ({ modifier })),
    { key },
  ];
};

/**
 * An Electron accelerator as a person reads it on `platform`, one part per
 * key: `⇧` `⌘` `W` on macOS, `Ctrl` `Shift` `W` elsewhere.
 */
export const acceleratorParts = (accelerator: string, platform: Platform) => {
  const isMacOS = platform === "darwin";
  const modifiers = new Map<Modifier, string>(
    isMacOS ? MAC_MODIFIERS : OTHER_MODIFIERS
  );

  return acceleratorKeys(accelerator, platform).map((part) => {
    if (part.modifier) {
      return modifiers.get(part.modifier) ?? "";
    }

    const named = (isMacOS ? MAC_KEYS : OTHER_KEYS)[part.key.toLowerCase()];

    return named ?? (part.key.length === 1 ? part.key.toUpperCase() : part.key);
  });
};

/**
 * An Electron accelerator as a person reads it on `platform`: `⇧⌘W` on
 * macOS, `Ctrl+Shift+W` elsewhere.
 */
export const formatAccelerator = (accelerator: string, platform: Platform) =>
  acceleratorParts(accelerator, platform).join(
    platform === "darwin" ? "" : "+"
  );
