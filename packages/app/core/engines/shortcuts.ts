export type Modifier =
  | "CommandOrControl"
  | "Command"
  | "Control"
  | "Alt"
  | "AltGr"
  | "Shift"
  | "Super";

export interface Accelerator {
  /** In canonical order, each at most once. */
  readonly modifiers: readonly Modifier[];
  readonly key: string;
}

const ORDER: readonly Modifier[] = [
  "CommandOrControl",
  "Command",
  "Control",
  "Alt",
  "AltGr",
  "Shift",
  "Super",
];

// Electron's accelerator names, case-insensitive, with their aliases.
const MODIFIERS: Readonly<Record<string, Modifier>> = {
  alt: "Alt",
  altgr: "AltGr",
  cmd: "Command",
  cmdorctrl: "CommandOrControl",
  command: "Command",
  commandorcontrol: "CommandOrControl",
  control: "Control",
  ctrl: "Control",
  meta: "Super",
  option: "Alt",
  shift: "Shift",
  super: "Super",
};

const NAMED_KEYS = [
  "Plus",
  "Space",
  "Tab",
  "Capslock",
  "Numlock",
  "Scrolllock",
  "Backspace",
  "Delete",
  "Insert",
  "Return",
  "Up",
  "Down",
  "Left",
  "Right",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Escape",
  "VolumeUp",
  "VolumeDown",
  "VolumeMute",
  "MediaNextTrack",
  "MediaPreviousTrack",
  "MediaStop",
  "MediaPlayPause",
  "PrintScreen",
  ...Array.from({ length: 24 }, (_, index) => `F${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `num${index}`),
  "numdec",
  "numadd",
  "numsub",
  "nummult",
  "numdiv",
];

const KEYS: ReadonlyMap<string, string> = new Map([
  ...NAMED_KEYS.map((key): [string, string] => [key.toLowerCase(), key]),
  ["enter", "Return"],
  ["esc", "Escape"],
]);

const keyOf = (text: string): string | undefined => {
  const named = KEYS.get(text.toLowerCase());
  if (named !== undefined) {
    return named;
  }
  // One printable character; `+` separates parts, so the plus key is spelled Plus.
  return /^[!-*,-~]$/u.test(text) ? text.toUpperCase() : undefined;
};

/** Reads an accelerator in Electron's form, such as `CmdOrCtrl+Shift+D`; undefined when Electron would refuse it. */
export const parseAccelerator = (text: string): Accelerator | undefined => {
  const parts = text.split("+").map((part) => part.trim());
  const last = parts.at(-1);
  const key = last === undefined ? undefined : keyOf(last);
  if (key === undefined) {
    return undefined;
  }
  const modifiers = new Set<Modifier>();
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIERS[part.toLowerCase()];
    if (modifier === undefined || modifiers.has(modifier)) {
      return undefined;
    }
    modifiers.add(modifier);
  }
  return {
    key,
    modifiers: ORDER.filter((modifier) => modifiers.has(modifier)),
  };
};

export const formatAccelerator = ({ modifiers, key }: Accelerator): string =>
  [...modifiers, key].join("+");

/** The canonical spelling of an accelerator, so two spellings of one compare equal; undefined when it does not parse. */
export const normalise = (text: string): string | undefined => {
  const parsed = parseAccelerator(text);
  return parsed === undefined ? undefined : formatAccelerator(parsed);
};

/** The keys an accelerator presses on a platform: CommandOrControl is Command on macOS and Control elsewhere, as Super is Command on macOS. */
export const onPlatform = (
  accelerator: Accelerator,
  platform: string
): Accelerator => {
  const mac = platform === "darwin";
  const pressed = new Set(
    accelerator.modifiers.map((modifier): Modifier => {
      if (modifier === "CommandOrControl") {
        return mac ? "Command" : "Control";
      }
      if (mac && modifier === "Super") {
        return "Command";
      }
      if (!mac && modifier === "Command") {
        return "Super";
      }
      return modifier;
    })
  );
  return {
    key: accelerator.key,
    modifiers: ORDER.filter((modifier) => pressed.has(modifier)),
  };
};

export interface ShortcutCommand<Id extends string = string> {
  readonly id: Id;
  readonly shortcut?: { readonly default: string };
}

/**
 * Each command's accelerator: the user's binding, null for one they unbound, else the command's default; normalised. A binding that does not parse leaves the default.
 */
export const resolveBindings = <Id extends string>(
  commands: readonly ShortcutCommand<Id>[],
  bindings: Readonly<Partial<Record<string, string | null>>>
): ReadonlyMap<Id, string | null> =>
  new Map(
    commands.map((command): [Id, string | null] => {
      const bound = Object.hasOwn(bindings, command.id)
        ? bindings[command.id]
        : undefined;
      if (bound === null) {
        return [command.id, null];
      }
      const chosen =
        (bound === undefined ? undefined : normalise(bound)) ??
        (command.shortcut === undefined
          ? undefined
          : normalise(command.shortcut.default));
      return [command.id, chosen ?? null];
    })
  );

export interface Conflict<Id extends string = string> {
  /** As pressed on the platform. */
  readonly accelerator: string;
  readonly ids: readonly Id[];
}

/** Accelerators that more than one command would answer on a platform. */
export const conflicts = <Id extends string>(
  resolved: ReadonlyMap<Id, string | null>,
  platform: string
): Conflict<Id>[] => {
  const byKeys = new Map<string, Id[]>();
  for (const [id, accelerator] of resolved) {
    const parsed =
      accelerator === null ? undefined : parseAccelerator(accelerator);
    if (parsed !== undefined) {
      const pressed = formatAccelerator(onPlatform(parsed, platform));
      byKeys.set(pressed, [...(byKeys.get(pressed) ?? []), id]);
    }
  }
  return [...byKeys]
    .filter(([, ids]) => ids.length > 1)
    .map(([accelerator, ids]) => ({ accelerator, ids }));
};
