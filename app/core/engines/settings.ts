import { isEqual } from "es-toolkit";
// A layer over a registry type parameter is a mapped type whose keys arrive with the caller's registry; the rule reads it as `{}` before they do.
/* oxlint-disable typescript/no-generated-empty-object-type */
import type { z } from "zod";

import type { Platform } from "../records/platform.ts";
import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";

export type SettingScope = "global" | "profile";

export interface SettingSpec<
  K extends string = string,
  S extends z.ZodType = z.ZodType,
  Scope extends SettingScope = SettingScope,
> {
  readonly key: K;
  readonly schema: S;
  readonly default: z.output<S>;
  /** Takes the place of `default` on the platforms it names. */
  readonly platformDefaults?: Readonly<Partial<Record<Platform, z.output<S>>>>;
  readonly scope: Scope;
}

export type SettingSpecs = readonly (
  | SettingSpec<string, z.ZodType, "global">
  | SettingSpec<string, z.ZodType, "profile">
)[];

export type KeyOf<R extends SettingSpecs> = R[number]["key"];

type SpecOf<R extends SettingSpecs, K extends KeyOf<R>> = Extract<
  R[number],
  { readonly key: K }
>;

// Read off the default rather than the schema, which is the same type for a concrete registry and the one TypeScript can follow through a generic key.
export type ValueOf<R extends SettingSpecs, K extends KeyOf<R>> = SpecOf<
  R,
  K
>["default"];

export type ProfileKeyOf<R extends SettingSpecs> = Extract<
  R[number],
  { readonly scope: "profile" }
>["key"];

type GlobalLayer<R extends SettingSpecs> = {
  readonly [K in KeyOf<R>]?: ValueOf<R, K>;
};

type ProfileLayer<R extends SettingSpecs> = {
  readonly [K in ProfileKeyOf<R>]?: ValueOf<R, K>;
};

export interface SettingsLayers<R extends SettingSpecs> {
  readonly global: GlobalLayer<R>;
  readonly profiles: Readonly<Record<string, ProfileLayer<R>>>;
}

export interface SettingChange<R extends SettingSpecs = SettingSpecs> {
  readonly key: KeyOf<R>;
  readonly profileId: string | null;
}

type Raw = Readonly<Record<string, unknown>>;

const specOf = <R extends SettingSpecs, K extends KeyOf<R>>(
  specs: R,
  key: K
): SpecOf<R, K> => {
  const found = specs.find((spec): spec is SpecOf<R, K> => spec.key === key);
  if (found === undefined) {
    throw new Error(`${key} is not a setting`);
  }
  return found;
};

type Mutable<L> = { -readonly [K in keyof L]: L[K] };

// TypeScript cannot follow a parsed value to its key's type through a generic key, so the value itself earns it; comparing the parse's output with the input keeps the check true for a schema that would transform or strip it.
const isValueOf = <R extends SettingSpecs, K extends KeyOf<R>>(
  spec: SpecOf<R, K>,
  value: unknown
): value is ValueOf<R, K> => {
  const parsed = spec.schema.safeParse(value);
  return parsed.success && isEqual(parsed.data, value);
};

const isKeyOf = <R extends SettingSpecs>(
  specs: R,
  key: string
): key is KeyOf<R> => specs.some((spec) => spec.key === key);

const isProfileKeyOf = <R extends SettingSpecs>(
  specs: R,
  key: string
): key is ProfileKeyOf<R> =>
  specs.some((spec) => spec.key === key && spec.scope === "profile");

/** Why a value was kept out of a layer. */
export type Refusal = "unknown" | "notProfileScoped" | "invalid";

/** Puts a value in a layer, the global one when `profileId` is null, parsing it once against its key's schema; null when it was put there. */
export const put = <R extends SettingSpecs>(
  specs: R,
  layer: Mutable<GlobalLayer<R>>,
  key: string,
  value: unknown,
  profileId: string | null
): Refusal | null => {
  if (!isKeyOf(specs, key)) {
    return "unknown";
  }
  if (profileId !== null && !isProfileKeyOf(specs, key)) {
    return "notProfileScoped";
  }
  if (!isValueOf(specOf(specs, key), value)) {
    return "invalid";
  }
  layer[key] = value;
  return null;
};

const lookup = (layer: Raw | undefined, key: string): unknown =>
  layer !== undefined && Object.hasOwn(layer, key)
    ? Reflect.get(layer, key)
    : undefined;

/** The value in force: the profile's override, then the global value, then the registry's default. */
export const resolve = <R extends SettingSpecs, K extends KeyOf<R>>(
  specs: R,
  settings: SettingsLayers<R>,
  key: K,
  profileId?: string
): ValueOf<R, K> => {
  const spec = specOf(specs, key);
  const global: ValueOf<R, K> | undefined = settings.global[key];
  const fallback = global ?? spec.default;
  if (profileId === undefined || spec.scope !== "profile") {
    return fallback;
  }
  const layer: GlobalLayer<R> | undefined = settings.profiles[profileId];
  return layer?.[key] ?? fallback;
};

/** The specs as `platform` has them, each platform default in the place of the default. */
export const forPlatform = <R extends SettingSpecs>(
  specs: R,
  platform: Platform
): readonly R[number][] =>
  specs.map((spec) => {
    const value: unknown = spec.platformDefaults?.[platform];
    return value === undefined ? spec : { ...spec, default: value };
  });

export const emptySettings = <R extends SettingSpecs>(): SettingsLayers<R> => ({
  global: {},
  profiles: {},
});

/**
 * Sets a key in one layer, or removes it when `value` is undefined. A profile layer takes only profile-scoped keys.
 */
export const withValue = <R extends SettingSpecs>(
  specs: R,
  settings: SettingsLayers<R>,
  key: string,
  value: unknown,
  profileId?: string
): Result<SettingsLayers<R>, string> => {
  if (!isKeyOf(specs, key)) {
    return err(`${key} is not a setting`);
  }
  if (profileId !== undefined && !isProfileKeyOf(specs, key)) {
    return err(`${key} is not a setting a profile may override`);
  }
  const layer: GlobalLayer<R> =
    profileId === undefined
      ? { ...settings.global }
      : { ...settings.profiles[profileId] };
  if (value === undefined) {
    Reflect.deleteProperty(layer, key);
  } else if (put(specs, layer, key, value, profileId ?? null) !== null) {
    return err(`${key} does not fit its schema`);
  }
  return ok(
    profileId === undefined
      ? { ...settings, global: layer }
      : { ...settings, profiles: { ...settings.profiles, [profileId]: layer } }
  );
};

/** The settings with a profile's override layer gone. */
export const withoutProfile = <R extends SettingSpecs>(
  settings: SettingsLayers<R>,
  profileId: string
): SettingsLayers<R> => ({
  ...settings,
  profiles: Object.fromEntries(
    Object.entries(settings.profiles).filter(([id]) => id !== profileId)
  ),
});

// A for-in over a generic layer is typed by the layer's keys, where Object.keys gives only strings.
const keysOf = <L extends Raw>(
  layer: L | undefined
): Extract<keyof L, string>[] => {
  const keys: Extract<keyof L, string>[] = [];
  if (layer !== undefined) {
    for (const key in layer) {
      if (Object.hasOwn(layer, key)) {
        keys.push(key);
      }
    }
  }
  return keys;
};

const diffLayer = <L extends Raw>(
  before: L | undefined,
  after: L | undefined,
  profileId: string | null
): {
  readonly key: Extract<keyof L, string>;
  readonly profileId: string | null;
}[] =>
  [...new Set([...keysOf(before), ...keysOf(after)])]
    .filter((key) => !isEqual(lookup(before, key), lookup(after, key)))
    .map((key) => ({ key, profileId }));

/** Every key whose stored value differs, per layer; a layer that appeared or went lists each of its keys. */
export const diff = <R extends SettingSpecs>(
  before: SettingsLayers<R>,
  after: SettingsLayers<R>
): SettingChange<R>[] => {
  const profileIds = new Set([
    ...Object.keys(before.profiles),
    ...Object.keys(after.profiles),
  ]);
  return [
    ...diffLayer(before.global, after.global, null),
    ...[...profileIds].flatMap((profileId) =>
      diffLayer(
        before.profiles[profileId],
        after.profiles[profileId],
        profileId
      )
    ),
  ];
};

/** The stored value of one key in one layer, for sending a change on; undefined when the layer does not set it. */
export const storedValue = <R extends SettingSpecs>(
  settings: SettingsLayers<R>,
  change: SettingChange<R>
): unknown =>
  lookup(
    change.profileId === null
      ? settings.global
      : settings.profiles[change.profileId],
    change.key
  );
