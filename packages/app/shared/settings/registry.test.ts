import { describe, expect, expectTypeOf, it } from "vitest";

import { registry } from "./registry.ts";
import type {
  ProfileSettingKey,
  SettingKey,
  SettingValue,
} from "./registry.ts";

describe("the settings registry", () => {
  it("declares each key once", () => {
    const keys = registry.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it.each(registry)("$key has a default its schema accepts", (entry) => {
    expect(entry.schema.safeParse(entry.default).success).toBeTruthy();
  });

  it("lets a profile override only the stage's zoom", () => {
    expectTypeOf<ProfileSettingKey>().toEqualTypeOf<"stage.zoom">();
    expectTypeOf<SettingKey>().toEqualTypeOf<
      "appearance.style" | "shortcuts.bindings" | "stage.zoom"
    >();
    expectTypeOf<SettingValue<"appearance.style">>().toEqualTypeOf<
      "modern" | "classic"
    >();
  });
});
