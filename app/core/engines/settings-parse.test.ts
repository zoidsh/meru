import { describe, expect, it } from "vitest";

import { specs } from "../fixtures/settings-specs.ts";
import { parseSettings } from "./settings-parse.ts";

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
