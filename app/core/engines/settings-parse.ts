// A layer over a registry type parameter is a mapped type whose keys arrive with the caller's registry; the rule reads it as `{}` before they do.
/* oxlint-disable typescript/no-generated-empty-object-type */
import { z } from "zod";

import { parseField } from "../values.ts";
import { EMPTY, toGlobal, toProfile } from "./settings.ts";
import type {
  ProfileLayer,
  Raw,
  SettingSpecs,
  SettingsLayers,
} from "./settings.ts";

/** A value, a layer or the file that was dropped on reading, and why. */
export interface Fallback {
  /** Null when the whole layer, or the whole file, was unusable. */
  readonly key: string | null;
  readonly profileId: string | null;
  readonly reason: "invalid" | "unknown" | "notProfileScoped";
}

const rawSchema = z.record(z.string(), z.unknown());

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
  const global = parseLayer(
    specs,
    parseField(raw, "global", z.unknown()),
    null
  );
  fallbacks.push(...global.fallbacks);
  const profiles: Record<string, ProfileLayer<R>> = {};
  const rawProfiles = parseField(raw, "profiles", z.unknown());
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
