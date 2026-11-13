// A layer over a registry type parameter is a mapped type whose keys arrive with the caller's registry; the rule reads it as `{}` before they do.
/* oxlint-disable typescript/no-generated-empty-object-type */
import { z } from "zod";

import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";
import { isEqual, pick } from "../values.ts";

export type SettingScope = "global" | "profile";

export interface SettingSpec<
  K extends string = string,
  S extends z.ZodType = z.ZodType,
  Scope extends SettingScope = SettingScope,
> {
  readonly key: K;
  readonly schema: S;
  readonly default: z.output<S>;
  readonly scope: Scope;
}

export type SettingSpecs = readonly (
  | SettingSpec<string, z.ZodType, "global">
  | SettingSpec<string, z.ZodType, "profile">
)[];

export type KeyOf<R extends SettingSpecs> = R[number]["key"];

export type SpecOf<R extends SettingSpecs, K extends KeyOf<R>> = Extract<
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

export type GlobalLayer<R extends SettingSpecs> = {
  readonly [K in KeyOf<R>]?: ValueOf<R, K>;
};

export type ProfileLayer<R extends SettingSpecs> = {
  readonly [K in ProfileKeyOf<R>]?: ValueOf<R, K>;
};

export interface SettingsLayers<R extends SettingSpecs> {
  readonly global: GlobalLayer<R>;
  readonly profiles: Readonly<Record<string, ProfileLayer<R>>>;
}

export interface Fallback {
  /** Null when the whole layer, or the whole file, was unusable. */
  readonly key: string | null;
  readonly profileId: string | null;
  readonly reason: "invalid" | "unknown" | "notProfileScoped";
}

export interface SettingChange<R extends SettingSpecs = SettingSpecs> {
  readonly key: KeyOf<R>;
  readonly profileId: string | null;
}

type Raw = Readonly<Record<string, unknown>>;

const rawSchema = z.record(z.string(), z.unknown());

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

const fits = (specs: SettingSpecs, layer: Raw, scope: SettingScope): boolean =>
  Object.entries(layer).every(([key, value]) => {
    const spec = specs.find((found) => found.key === key);
    return (
      spec !== undefined &&
      (scope === "global" || spec.scope === "profile") &&
      spec.schema.safeParse(value).success
    );
  });

// Each value was parsed against its own key's schema before the layer was built, which is what this checks again; TypeScript cannot follow a value to its key through a loop over the registry.
const isGlobalLayer = <R extends SettingSpecs>(
  specs: R,
  layer: Raw
): layer is GlobalLayer<R> => fits(specs, layer, "global");

const isProfileLayer = <R extends SettingSpecs>(
  specs: R,
  layer: Raw
): layer is ProfileLayer<R> => fits(specs, layer, "profile");

const EMPTY: Raw = {};

const toGlobal = <R extends SettingSpecs>(
  specs: R,
  layer: Raw
): GlobalLayer<R> => {
  if (!isGlobalLayer(specs, layer)) {
    throw new Error("A global layer was built from unparsed values");
  }
  return layer;
};

const toProfile = <R extends SettingSpecs>(
  specs: R,
  layer: Raw
): ProfileLayer<R> => {
  if (!isProfileLayer(specs, layer)) {
    throw new Error("A profile layer was built from unparsed values");
  }
  return layer;
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

const parseLayer = (
  specs: SettingSpecs,
  raw: unknown,
  profileId: string | null
): { layer: Raw; fallbacks: Fallback[] } => {
  const read = rawSchema.safeParse(raw);
  if (!read.success) {
    return {
      fallbacks:
        raw === undefined ? [] : [{ key: null, profileId, reason: "invalid" }],
      layer: EMPTY,
    };
  }
  const fallbacks: Fallback[] = [];
  const layer: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(read.data)) {
    const spec = specs.find((found) => found.key === key);
    if (spec === undefined) {
      fallbacks.push({ key, profileId, reason: "unknown" });
      continue;
    }
    if (profileId !== null && spec.scope !== "profile") {
      fallbacks.push({ key, profileId, reason: "notProfileScoped" });
      continue;
    }
    const parsed = spec.schema.safeParse(value);
    if (parsed.success) {
      layer[key] = parsed.data;
    } else {
      fallbacks.push({ key, profileId, reason: "invalid" });
    }
  }
  return { fallbacks, layer };
};

/** Parses each key on its own, so one bad value costs only that key; everything dropped is reported. Undefined is no file, which drops nothing. */
export const parseSettings = <R extends SettingSpecs>(
  specs: R,
  raw: unknown
): { settings: SettingsLayers<R>; fallbacks: Fallback[] } => {
  const fallbacks: Fallback[] =
    raw === undefined || rawSchema.safeParse(raw).success
      ? []
      : [{ key: null, profileId: null, reason: "invalid" }];
  const global = parseLayer(specs, pick(raw, "global", z.unknown()), null);
  fallbacks.push(...global.fallbacks);
  const profiles: Record<string, ProfileLayer<R>> = {};
  const rawProfiles = pick(raw, "profiles", z.unknown());
  const profileLayers = rawSchema.safeParse(rawProfiles);
  if (rawProfiles !== undefined && !profileLayers.success) {
    fallbacks.push({ key: null, profileId: null, reason: "invalid" });
  }
  for (const [profileId, rawLayer] of Object.entries(
    profileLayers.success ? profileLayers.data : {}
  )) {
    const parsed = parseLayer(specs, rawLayer, profileId);
    fallbacks.push(...parsed.fallbacks);
    profiles[profileId] = toProfile(specs, parsed.layer);
  }
  return {
    fallbacks,
    settings: { global: toGlobal(specs, global.layer), profiles },
  };
};

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
  const spec = specs.find((found) => found.key === key);
  if (spec === undefined) {
    return err(`${key} is not a setting`);
  }
  if (profileId !== undefined && spec.scope !== "profile") {
    return err(`${key} is not a setting a profile may override`);
  }
  const current: Raw =
    profileId === undefined
      ? settings.global
      : (settings.profiles[profileId] ?? EMPTY);
  let next: Raw;
  if (value === undefined) {
    const { [key]: _removed, ...rest } = current;
    next = rest;
  } else {
    const parsed = spec.schema.safeParse(value);
    if (!parsed.success) {
      return err(`${key}: ${parsed.error.message}`);
    }
    next = { ...current, [key]: parsed.data };
  }
  return ok(
    profileId === undefined
      ? { ...settings, global: toGlobal(specs, next) }
      : {
          ...settings,
          profiles: {
            ...settings.profiles,
            [profileId]: toProfile(specs, next),
          },
        }
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
