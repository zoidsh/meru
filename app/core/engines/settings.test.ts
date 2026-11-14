import { describe, expect, expectTypeOf, it } from "vitest";

import { specs } from "../fixtures/settings-specs.ts";
import {
  diff,
  emptySettings,
  forPlatform,
  resolve,
  storedValue,
  withValue,
} from "./settings.ts";
import type { SettingsLayers } from "./settings.ts";

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

describe(forPlatform, () => {
  it("takes a platform's own default where it has one, and the default elsewhere, under any stored value", () => {
    expect([
      resolve(forPlatform(specs, "darwin"), settings({}), "look.style"),
      resolve(forPlatform(specs, "linux"), settings({}), "look.style"),
      resolve(
        forPlatform(specs, "darwin"),
        settings({ global: { "look.style": "modern" } }),
        "look.style"
      ),
    ]).toStrictEqual(["classic", "modern", "modern"]);
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
