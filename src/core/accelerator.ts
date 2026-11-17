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

/** Where the punctuation a shortcut names sits, for those that have one. */
const CODES: Record<string, string> = {
  ",": "Comma",
  "[": "BracketLeft",
  "]": "BracketRight",
};

const codeOf = (key: string) => CODES[key];

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

  return (
    sameModifiers &&
    (input.key.toLowerCase() === key.toLowerCase() ||
      (codeOf(key) !== undefined && input.code === codeOf(key)))
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

/**
 * An Electron accelerator as a person reads it on `platform`: `⌘⇧W` on
 * macOS, `Ctrl+Shift+W` elsewhere.
 */
export const formatAccelerator = (accelerator: string, platform: Platform) => {
  const isMacOS = platform === "darwin";
  const parts = accelerator.split("+");
  const key = parts.pop() ?? "";
  const held = new Set(parts.map((part) => modifierOf(part, isMacOS)));
  const shown = [
    ...(isMacOS ? MAC_MODIFIERS : OTHER_MODIFIERS)
      .filter(([modifier]) => held.has(modifier))
      .map(([, symbol]) => symbol),
    key.length === 1 ? key.toUpperCase() : key,
  ];

  return shown.join(isMacOS ? "" : "+");
};
