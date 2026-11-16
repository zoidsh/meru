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
}

/** Where the punctuation a shortcut names sits, for those that have one. */
const CODES: Record<string, string> = {
  "[": "BracketLeft",
  "]": "BracketRight",
};

const codeOf = (key: string) => CODES[key];

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
    switch (part.toLowerCase()) {
      case "commandorcontrol":
      case "cmdorctrl": {
        wanted[isMacOS ? "meta" : "control"] = true;
        break;
      }
      case "command":
      case "cmd":
      case "super":
      case "meta": {
        wanted.meta = true;
        break;
      }
      case "control":
      case "ctrl": {
        wanted.control = true;
        break;
      }
      case "shift": {
        wanted.shift = true;
        break;
      }
      case "alt":
      case "option": {
        wanted.alt = true;
        break;
      }
      default: {
        return false;
      }
    }
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
