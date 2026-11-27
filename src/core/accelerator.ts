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

/**
 * Named keys as `aria-keyshortcuts` names them, by Electron's name, lower
 * case: Electron's `Left` is `ArrowLeft`. A key event uses the same names
 * but for Space, which it calls " ".
 */
const KEY_NAMES: Record<string, string> = {
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

  const named = KEY_NAMES[key.toLowerCase()] ?? key;
  const typed = input.key === " " ? "Space" : input.key;

  return (
    sameModifiers && (typed.toLowerCase() === named.toLowerCase() || byPlace)
  );
};

/** What a key pressed while a shortcut is recorded asks for. */
export type RecordedKey =
  /** A modifier alone, so the key is still to come. */
  | { kind: "pending" }
  | { kind: "cancel" }
  /** Leave the command without a key. */
  | { kind: "clear" }
  /** Tab, which moves focus on. */
  | { kind: "leave" }
  /** A key no accelerator can name, recorded as nothing. */
  | { kind: "refused" }
  /** A key with no modifier but Shift, which types text. */
  | { kind: "needsModifier" }
  | { kind: "key"; accelerator: string };

/** A key event's keys as the recorder reads them. */
export type PressedKey = Pick<
  KeyInput,
  "key" | "code" | "control" | "shift" | "alt" | "meta"
>;

const MODIFIER_KEYS = new Set([
  "Shift",
  "Control",
  "Alt",
  "AltGraph",
  "Meta",
  "OS",
  "Fn",
  "CapsLock",
]);

/** The named keys a key event gives that an accelerator can name, by Electron's name. */
const NAMED_KEYS: Record<string, string> = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Enter",
  Tab: "Tab",
  " ": "Space",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Insert: "Insert",
  "+": "Plus",
};

const FUNCTION_KEY = /^F(?:[1-9]|1\d|2[0-4])$/u;

const LETTER = /^[a-z]$/iu;

/** The characters Electron's accelerators name, apart from Plus. */
const PUNCTUATION = new Set("`~!@#$%^&*()-_=[{]}\\|;:'\",<.>/?");

const PLACES = Object.fromEntries(
  Object.entries(CODES).map(([key, code]) => [code, key])
);

/** The key's name in an accelerator as the matcher hears it, if it has one. */
const recordedName = ({ key, code }: PressedKey): string | undefined => {
  // A dead key types nothing yet, so it has no stable name, wherever it is.
  if (key === "Dead" || key === "Unidentified" || key === "Process") {
    return undefined;
  }

  if (DIGIT.test(key)) {
    return key;
  }

  // Heard by where it is, as the matcher hears these keys.
  if (PLACES[code] !== undefined) {
    return PLACES[code];
  }

  if (LETTER.test(key)) {
    return key.toUpperCase();
  }

  if (NAMED_KEYS[key] !== undefined || FUNCTION_KEY.test(key)) {
    return NAMED_KEYS[key] ?? key;
  }

  return PUNCTUATION.has(key) ? key : undefined;
};

const RECORDED_NAMES = new Set(
  [...Object.values(PLACES), ...Object.values(NAMED_KEYS), ...PUNCTUATION].map(
    (name) => name.toLowerCase()
  )
);

/**
 * Whether the recorder could have recorded `accelerator`, so a stored one
 * that names a key it never would, or with no modifier it needs, is read
 * as none.
 */
export const isRecordable = (accelerator: string, isMacOS: boolean) => {
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const modifiers = parts.map((part) => modifierOf(part, isMacOS));
  const lower = key.toLowerCase();
  const isFunctionKey = FUNCTION_KEY.test(key.toUpperCase());

  return (
    !modifiers.includes(undefined) &&
    (isMacOS || !modifiers.includes("meta")) &&
    (isFunctionKey || modifiers.some((modifier) => modifier !== "shift")) &&
    (isFunctionKey ||
      LETTER.test(key) ||
      DIGIT.test(key) ||
      RECORDED_NAMES.has(lower))
  );
};

/**
 * What a key pressed into the shortcut recorder records: an accelerator
 * `matchesAccelerator` hears from the same key, or why none. A dead key, a
 * character no accelerator can name and, off macOS, anything with the
 * Windows key, which the system keeps, are refused.
 */
export const recordKey = (
  pressed: PressedKey,
  isMacOS: boolean
): RecordedKey => {
  const { key, control, shift, alt, meta } = pressed;

  if (MODIFIER_KEYS.has(key)) {
    return { kind: "pending" };
  }

  if (key === "Escape") {
    return { kind: "cancel" };
  }

  if (key === "Backspace" || key === "Delete") {
    return { kind: "clear" };
  }

  if (key === "Tab" && !control && !alt && !meta) {
    return { kind: "leave" };
  }

  const name = recordedName(pressed);

  if (name === undefined || (meta && !isMacOS)) {
    return { kind: "refused" };
  }

  if (!FUNCTION_KEY.test(name) && !control && !alt && !meta) {
    return { kind: "needsModifier" };
  }

  return {
    kind: "key",
    accelerator: [
      ...(control ? ["Control"] : []),
      ...(alt ? ["Alt"] : []),
      ...(shift ? ["Shift"] : []),
      ...(meta ? ["Command"] : []),
      name,
    ].join("+"),
  };
};

/** Names Electron takes for one key, by the one this file compares. */
const KEY_ALIASES: Record<string, string> = {
  return: "enter",
  esc: "escape",
  "+": "plus",
};

/**
 * One string per key however an accelerator spells it, so two that press
 * the same keys compare equal: `CmdOrCtrl+Shift+W` and `Shift+Command+W` on
 * macOS. `undefined` for a modifier Electron does not know.
 */
export const acceleratorIdentity = (accelerator: string, isMacOS: boolean) => {
  const parts = accelerator.split("+");
  let key = parts.pop() ?? "";

  // `Control++` names Plus by its symbol, which splits into two empties.
  if (key === "" && parts.at(-1) === "") {
    parts.pop();
    key = "+";
  }

  const modifiers = parts.map((part) => modifierOf(part, isMacOS));
  const held = new Set(modifiers);
  const lower = key.toLowerCase();

  return held.has(undefined)
    ? undefined
    : [
        ...(["control", "alt", "shift", "meta"] as const).filter((modifier) =>
          held.has(modifier)
        ),
        KEY_ALIASES[lower] ?? lower,
      ].join("+");
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
    KEY_NAMES[key.toLowerCase()] ??
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
