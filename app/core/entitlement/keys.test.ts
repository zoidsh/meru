import { describe, expect, it } from "vitest";

import { acceptedKeys, DEV_KID } from "./keys.ts";

describe(acceptedKeys, () => {
  it("leaves the development key out of an installed app", () => {
    expect(acceptedKeys(true)).not.toHaveProperty(DEV_KID);
    expect(acceptedKeys(false)).toHaveProperty(DEV_KID);
  });
});
