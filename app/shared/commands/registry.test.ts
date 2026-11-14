import { describe, expect, it } from "vitest";

import { conflicts, resolveBindings } from "../../core/engines/shortcuts.ts";
import { platformSchema } from "../../core/records/platform.ts";
import { commands } from "./registry.ts";

describe("the default shortcuts", () => {
  it.each(platformSchema.options)(
    "put no two commands on one key on %s",
    (platform) => {
      expect(
        conflicts(resolveBindings(commands, {}, platform), platform)
      ).toStrictEqual([]);
    }
  );
});
