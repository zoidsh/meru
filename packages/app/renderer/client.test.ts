import { describe, expect, it } from "vitest";

import { createClient } from "./client.ts";

describe(createClient, () => {
  it("reads the platform from the bridge", () => {
    expect(createClient({ meru: { platform: "linux" } }).platform).toBe(
      "linux"
    );
  });

  it("refuses a page without the bridge", () => {
    expect(() => createClient(window)).toThrow("window.meru is missing");
    expect(() => createClient({ meru: { platform: 1 } })).toThrow(
      "window.meru is missing"
    );
  });
});
