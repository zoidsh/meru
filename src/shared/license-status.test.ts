import { describe, expect, it } from "vitest";

import { licenseActionOf } from "./license-status.ts";

describe(licenseActionOf, () => {
  it("sends a refused license to support, never to Upgrade", () => {
    expect(licenseActionOf("refused")).toBe("support");
  });

  it("offers Upgrade with no license, Try again while unconfirmed, and nothing once licensed", () => {
    expect(
      (
        [
          "trial",
          "trialEnded",
          "none",
          "provisional",
          "unconfirmed",
          "licensed",
        ] as const
      ).map(licenseActionOf)
    ).toStrictEqual([
      "upgrade",
      "upgrade",
      "upgrade",
      "retry",
      "retry",
      "licensed",
    ]);
  });
});
