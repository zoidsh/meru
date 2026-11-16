import { describe, expect, it } from "vitest";

import { readLaunchOptions } from "./launch-options.ts";

describe(readLaunchOptions, () => {
  it("opens in the background when MERU_BACKGROUND=1 or --background is given", () => {
    expect(
      readLaunchOptions({ argv: [], env: { MERU_BACKGROUND: "1" } })
    ).toStrictEqual({ background: true });
    expect(
      readLaunchOptions({ argv: ["--background"], env: {} })
    ).toStrictEqual({ background: true });
    expect(readLaunchOptions({ argv: [], env: {} })).toStrictEqual({
      background: false,
    });
  });
});
