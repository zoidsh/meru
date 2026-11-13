import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { msg } from "../msg.ts";
import { defineSetting } from "./define.ts";

const entry = {
  default: false,
  label: msg`Flag`,
  page: "panes",
  restart: false,
  schema: z.boolean(),
  scope: "global",
  tier: "free",
} as const;

describe(defineSetting, () => {
  it("keeps the key and infers the value from the schema", () => {
    const setting = defineSetting("stage.flag", entry);
    expect(setting.key).toBe("stage.flag");
    expectTypeOf(setting.key).toEqualTypeOf<"stage.flag">();
    expectTypeOf(setting.default).toEqualTypeOf<boolean>();
  });

  it("takes only a feature.name key", () => {
    // @ts-expect-error: no feature
    defineSetting("flag", entry);
    // @ts-expect-error: a third level
    defineSetting("stage.pane.flag", entry);
    // @ts-expect-error: the name is camelCase
    defineSetting("stage.Flag", entry);
    // @ts-expect-error: the feature is lower case
    defineSetting("Stage.flag", entry);
    expect(defineSetting("stage.someFlag", entry).key).toBe("stage.someFlag");
  });

  it("checks the default against the schema", () => {
    const wrong = { ...entry, default: "no" };
    // @ts-expect-error: a string is not a boolean
    expect(defineSetting("stage.flag", wrong)).toBeDefined();
  });

  it("names each value of a choice, and nothing for any other kind", () => {
    const choice = {
      ...entry,
      default: "a" as const,
      schema: z.enum(["a", "b"]),
    };
    // @ts-expect-error: a choice names its values
    defineSetting("stage.pick", choice);
    // @ts-expect-error: every value is named
    defineSetting("stage.pick", { ...choice, options: { a: msg`A` } });
    // @ts-expect-error: a boolean has no values to name
    defineSetting("stage.flag", { ...entry, options: { on: msg`On` } });
    expect(
      defineSetting("stage.pick", {
        ...choice,
        options: { a: msg`A`, b: msg`B` },
      }).options
    ).toStrictEqual({ a: "A", b: "B" });
  });

  it("formats a message as its text until it is translated", () => {
    const count = 2;
    expect(msg`Split ${count} panes`).toBe("Split 2 panes");
  });
});
