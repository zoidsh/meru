import { describe, expect, it } from "vitest";
import { z } from "zod";

import { registry } from "../../../shared/settings/registry.ts";
import { fieldKindOf } from "./field-kind.ts";

describe(fieldKindOf, () => {
  it("reads each kind off its schema, a number with the schema's bounds", () => {
    expect([
      fieldKindOf(z.boolean()),
      fieldKindOf(z.enum(["stable", "beta"])),
      fieldKindOf(z.number().int().min(1).max(168)),
      fieldKindOf(z.number().min(0.25)),
      fieldKindOf(z.string()),
      fieldKindOf(z.array(z.string().min(1))),
      fieldKindOf(z.record(z.string(), z.string())),
    ]).toStrictEqual([
      { kind: "boolean" },
      { kind: "choice", values: ["stable", "beta"] },
      { kind: "number", max: 168, min: 1, step: 1 },
      { kind: "number", max: undefined, min: 0.25, step: 0.1 },
      { kind: "text" },
      { kind: "list" },
      { kind: "bespoke" },
    ]);
  });

  it("finds a field for every setting but the shortcuts page's bindings, which it edits with its own control", () => {
    expect(
      registry
        .filter((setting) => fieldKindOf(setting.schema).kind === "bespoke")
        .map((setting) => setting.key)
    ).toStrictEqual(["shortcuts.bindings"]);
  });
});
