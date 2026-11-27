import { acceleratorIdentity, isRecordable } from "./accelerator.ts";
import type { Platform } from "./platform.ts";

/**
 * The person's keys as `settings.json` keeps them, one set per platform,
 * each a command's id to an accelerator, or `""` for no key; a command
 * missing from its platform's set has its default.
 */
export type CustomShortcuts = Readonly<Record<string, unknown>>;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The platform's set, each value that the recorder could have recorded or
 * `""`; anything else is ignored here and stays stored as found.
 */
export const customShortcutsOf = (
  stored: CustomShortcuts,
  platform: Platform
): Readonly<Record<string, string>> => {
  const set = stored[platform];

  return isRecord(set)
    ? Object.fromEntries(
        Object.entries(set).filter(
          (entry): entry is [string, string] =>
            typeof entry[1] === "string" &&
            (entry[1] === "" || isRecordable(entry[1], platform === "darwin"))
        )
      )
    : {};
};

/** A key held outside the registry, which no command may take. */
export interface FixedKey {
  /** What holds it, for main to name. */
  id: string;
  accelerator: string;
}

export interface KeymapInput {
  /** Every command's default key on this platform, in the registry's order. */
  defaults: Readonly<Record<string, string | undefined>>;
  /** The commands a person may change the key of. */
  changeable: ReadonlySet<string>;
  /** This platform's set as `customShortcutsOf` reads it; `{}` while not entitled. */
  custom: Readonly<Record<string, string>>;
  fixed: readonly FixedKey[];
  isMacOS: boolean;
}

export interface Keymap {
  /** Each command's key as this run hears it, `undefined` for none. */
  keys: Readonly<Record<string, string | undefined>>;
  /** The commands whose own key applies. */
  changed: ReadonlySet<string>;
}

const identityOf = (accelerator: string | undefined, isMacOS: boolean) =>
  accelerator === undefined || accelerator === ""
    ? undefined
    : acceleratorIdentity(accelerator, isMacOS);

/**
 * The defaults with this platform's own keys over them. A command's own
 * key that a fixed key, a default or an earlier command's own key holds is
 * ignored, the command keeping its default, which may in turn take the key
 * of a later command's own; so this repeats until nothing changes, and two
 * commands never share a key.
 */
export const effectiveKeymap = ({
  defaults,
  changeable,
  custom,
  fixed,
  isMacOS,
}: KeymapInput): Keymap => {
  const ids = Object.keys(defaults);
  const fixedKeys = new Set(
    fixed.map(({ accelerator }) => identityOf(accelerator, isMacOS))
  );
  const changed = new Set(
    ids.filter((id) => changeable.has(id) && Object.hasOwn(custom, id))
  );
  const keyOf = (id: string) =>
    changed.has(id) ? custom[id] || undefined : defaults[id];

  for (;;) {
    const losing = ids.filter((id, index) => {
      const identity = identityOf(keyOf(id), isMacOS);

      return (
        changed.has(id) &&
        identity !== undefined &&
        (fixedKeys.has(identity) ||
          ids.some(
            (other, otherIndex) =>
              other !== id &&
              identityOf(keyOf(other), isMacOS) === identity &&
              (!changed.has(other) || otherIndex < index)
          ))
      );
    });

    if (losing.length === 0) {
      break;
    }

    for (const id of losing) {
      changed.delete(id);
    }
  }

  return {
    keys: Object.fromEntries(ids.map((id) => [id, keyOf(id)])),
    changed,
  };
};

/**
 * What holds `accelerator` besides the command `id`: another command, by
 * its id, or a fixed key, by its own; `undefined` while it is free.
 */
export const shortcutHolder = (
  keymap: Keymap,
  fixed: readonly FixedKey[],
  id: string,
  accelerator: string,
  isMacOS: boolean
): { command: string } | { fixed: string } | undefined => {
  const identity = identityOf(accelerator, isMacOS);

  if (identity === undefined) {
    return undefined;
  }

  const held = fixed.find(
    (key) => identityOf(key.accelerator, isMacOS) === identity
  );

  if (held) {
    return { fixed: held.id };
  }

  const command = Object.keys(keymap.keys).find(
    (other) =>
      other !== id && identityOf(keymap.keys[other], isMacOS) === identity
  );

  return command === undefined ? undefined : { command };
};

/**
 * The stored sets with the command's key on `platform` set to `key`, or
 * removed for `undefined` or for its default; the other platforms' sets,
 * and whatever this run cannot read in its own, stay as found.
 */
export const withCustomShortcut = (
  stored: CustomShortcuts,
  platform: Platform,
  id: string,
  key: string | undefined,
  defaultKey: string | undefined
): CustomShortcuts => {
  const isMacOS = platform === "darwin";
  const own = isRecord(stored[platform]) ? stored[platform] : {};
  const { [id]: _replaced, ...rest } = own;
  const isDefault =
    key === undefined ||
    (key === "" && defaultKey === undefined) ||
    (defaultKey !== undefined &&
      identityOf(key, isMacOS) === identityOf(defaultKey, isMacOS));
  const next = isDefault ? rest : { ...rest, [id]: key };
  const { [platform]: _set, ...others } = stored;

  return Object.keys(next).length > 0
    ? { ...others, [platform]: next }
    : others;
};
