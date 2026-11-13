import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import {
  diff,
  emptySettings,
  parseSettings,
  resolve,
  storedValue,
  withValue,
} from "./settings.ts";
import type { SettingSpec, SettingsLayers } from "./settings.ts";

const spec = <
  const K extends string,
  S extends z.ZodType,
  const Scope extends "global" | "profile",
>(
  value: SettingSpec<K, S, Scope>
) => value;

const specs = [
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

type Layers = SettingsLayers<typeof specs>;

const settings = (layers: Partial<Layers>): Layers => ({
  ...emptySettings<typeof specs>(),
  ...layers,
});

describe(resolve, () => {
  it("takes the profile's override, then the global value, then the default", () => {
    const stored = settings({
      global: { "pane.zoom": 1.5 },
      profiles: { work: { "pane.zoom": 2 } },
    });
    expect(resolve(specs, stored, "pane.zoom", "work")).toBe(2);
    expect(resolve(specs, stored, "pane.zoom", "home")).toBe(1.5);
    expect(resolve(specs, stored, "pane.zoom")).toBe(1.5);
    expect(resolve(specs, settings({}), "pane.zoom", "work")).toBe(1);
    expect(resolve(specs, settings({}), "look.style")).toBe("modern");
  });

  it("is typed by the key", () => {
    expectTypeOf(resolve(specs, settings({}), "look.style")).toEqualTypeOf<
      "modern" | "classic"
    >();
    expectTypeOf(
      resolve(specs, settings({}), "pane.zoom", "work")
    ).toEqualTypeOf<number>();
    // @ts-expect-error: not a key of the registry
    expect(() => resolve(specs, settings({}), "look.colour")).toThrow(
      "look.colour is not a setting"
    );
  });

  it("refuses a profile override of a global key at compile time", () => {
    const layers: Layers = {
      global: { "look.style": "classic" },
      profiles: {
        // @ts-expect-error: look.style is global, so no profile may override it
        work: { "look.style": "modern" },
      },
    };
    expect(resolve(specs, layers, "look.style", "work")).toBe("classic");
  });
});

describe(parseSettings, () => {
  it("keeps every valid key", () => {
    const raw = {
      global: { "keys.bindings": { "a.b": null }, "look.style": "classic" },
      profiles: { work: { "pane.zoom": 2 } },
    };
    expect(parseSettings(specs, raw)).toStrictEqual({
      fallbacks: [],
      settings: raw,
    });
  });

  it("drops a bad key alone and reports it", () => {
    const { settings: parsed, fallbacks } = parseSettings(specs, {
      global: { "look.style": "neon", "pane.zoom": 2, "x.y": 1 },
      profiles: { home: "nope", work: { "pane.zoom": 9 } },
    });
    expect(parsed).toStrictEqual({
      global: { "pane.zoom": 2 },
      profiles: { home: {}, work: {} },
    });
    expect(fallbacks).toStrictEqual([
      { key: "look.style", profileId: null, reason: "invalid" },
      { key: "x.y", profileId: null, reason: "unknown" },
      { key: null, profileId: "home", reason: "invalid" },
      { key: "pane.zoom", profileId: "work", reason: "invalid" },
    ]);
  });

  it("drops a profile override of a global key", () => {
    const { settings: parsed, fallbacks } = parseSettings(specs, {
      profiles: { work: { "look.style": "classic", "pane.zoom": 2 } },
    });
    expect(parsed.profiles).toStrictEqual({ work: { "pane.zoom": 2 } });
    expect(fallbacks).toStrictEqual([
      { key: "look.style", profileId: "work", reason: "notProfileScoped" },
    ]);
  });

  it("falls back whole when the file is not an object", () => {
    for (const raw of [null, "settings", [], 3]) {
      expect(parseSettings(specs, raw)).toStrictEqual({
        fallbacks: [{ key: null, profileId: null, reason: "invalid" }],
        settings: { global: {}, profiles: {} },
      });
    }
    expect(parseSettings(specs, {})).toStrictEqual({
      fallbacks: [],
      settings: { global: {}, profiles: {} },
    });
  });
});

describe(withValue, () => {
  it("sets and removes a key in one layer", () => {
    const set = withValue(specs, settings({}), "pane.zoom", 2, "work");
    expect(set).toStrictEqual({
      ok: true,
      value: { global: {}, profiles: { work: { "pane.zoom": 2 } } },
    });
    const removed = set.ok
      ? withValue(specs, set.value, "pane.zoom", undefined, "work")
      : set;
    expect(removed).toStrictEqual({
      ok: true,
      value: { global: {}, profiles: { work: {} } },
    });
  });

  it("refuses a bad value, an unknown key and a profile override of a global key", () => {
    expect(withValue(specs, settings({}), "pane.zoom", 7).ok).toBeFalsy();
    expect(withValue(specs, settings({}), "x.y", 1).ok).toBeFalsy();
    expect(
      withValue(specs, settings({}), "look.style", "classic", "work")
    ).toStrictEqual({
      error: "look.style is not a setting a profile may override",
      ok: false,
    });
  });
});

describe(diff, () => {
  it("lists the keys that changed in each layer", () => {
    const before = settings({
      global: { "keys.bindings": { "a.b": "X" }, "look.style": "classic" },
      profiles: { home: { "pane.zoom": 2 }, work: { "pane.zoom": 2 } },
    });
    const after = settings({
      global: { "keys.bindings": { "a.b": "X" }, "pane.zoom": 1.5 },
      profiles: { new: { "pane.zoom": 3 }, work: { "pane.zoom": 2 } },
    });
    expect(diff(before, after)).toStrictEqual([
      { key: "look.style", profileId: null },
      { key: "pane.zoom", profileId: null },
      { key: "pane.zoom", profileId: "home" },
      { key: "pane.zoom", profileId: "new" },
    ]);
    expect(storedValue(after, { key: "pane.zoom", profileId: "new" })).toBe(3);
    expect(
      storedValue(after, { key: "look.style", profileId: null })
    ).toBeUndefined();
  });

  it("compares values by structure", () => {
    const before = settings({
      global: { "keys.bindings": { a: "X", b: null } },
    });
    const after = settings({
      global: { "keys.bindings": { a: "Y", b: null } },
    });
    expect(diff(before, before)).toStrictEqual([]);
    expect(
      diff(
        before,
        settings({ global: { "keys.bindings": { a: "X", b: null } } })
      )
    ).toStrictEqual([]);
    expect(diff(before, after)).toStrictEqual([
      { key: "keys.bindings", profileId: null },
    ]);
  });
});
