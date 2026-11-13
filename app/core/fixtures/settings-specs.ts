import { z } from "zod";

import type { SettingSpec } from "../engines/settings.ts";

const spec = <
  const K extends string,
  S extends z.ZodType,
  const Scope extends "global" | "profile",
>(
  value: SettingSpec<K, S, Scope>
) => value;

/** A registry of three settings, one of each kind of value, for the settings engine's tests. */
export const specs = [
  spec({
    default: "modern",
    key: "look.style",
    schema: z.enum(["modern", "classic"]),
    scope: "global",
  }),
  spec({
    default: 1,
    key: "pane.zoom",
    schema: z.number().min(0.5).max(3),
    scope: "profile",
  }),
  spec({
    default: {},
    key: "keys.bindings",
    schema: z.record(z.string(), z.string().nullable()),
    scope: "global",
  }),
] as const;
