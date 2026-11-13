import { describe, expect, it } from "vitest";

import { hasSigningEnv, SIGNING_ENV } from "./signing-env.ts";

const all = (platform: keyof typeof SIGNING_ENV) =>
  Object.fromEntries(SIGNING_ENV[platform].map((name) => [name, "set"]));

describe(hasSigningEnv, () => {
  it.each(["mac", "win"] as const)(
    "is false for %s with nothing set",
    (platform) => {
      expect(hasSigningEnv(platform, {})).toBeFalsy();
    }
  );

  it.each(["mac", "win"] as const)(
    "is true for %s with everything set",
    (platform) => {
      expect(hasSigningEnv(platform, all(platform))).toBeTruthy();
    }
  );

  it("throws on a partial set, naming what is missing", () => {
    const { APPLE_API_ISSUER: _, ...partial } = all("mac");
    expect(() => hasSigningEnv("mac", partial)).toThrow(
      /missing APPLE_API_ISSUER\./u
    );
  });

  it("counts an empty value as missing", () => {
    expect(() =>
      hasSigningEnv("win", { ...all("win"), AZURE_CLIENT_SECRET: "" })
    ).toThrow(/missing AZURE_CLIENT_SECRET/u);
  });

  it("ignores the other platform's names", () => {
    expect(hasSigningEnv("win", all("mac"))).toBeFalsy();
  });
});
