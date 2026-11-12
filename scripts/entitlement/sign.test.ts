import { describe, expect, it } from "vitest";

import { verifyToken } from "../../packages/app/core/entitlement/verify.ts";
import {
  acceptedKeys,
  DEV_KID,
  importKeys,
} from "../../packages/app/shared/entitlement/keys.ts";
import { mintToken } from "./sign.ts";

const NOW = 1_800_000_000_000;

const draft = {
  deviceLimit: 3,
  plan: "pro",
  status: "active",
  sub: "device-1",
  ttl: 10_800,
} as const;

describe(mintToken, () => {
  it("signs with the key a run from the repository accepts", async () => {
    const keys = await importKeys(crypto.subtle, acceptedKeys(false));
    const verified = await verifyToken(mintToken(draft, { now: NOW }), {
      deviceId: "device-1",
      keys,
      now: NOW,
      skewSeconds: 0,
      subtle: crypto.subtle,
    });
    expect(verified).toStrictEqual({
      ok: true,
      value: { ...draft, exp: NOW / 1000 + 10_800, iat: NOW / 1000 },
    });
  });

  it("refuses claims the app would call malformed", () => {
    expect(() => mintToken({ ...draft, plan: "trial" })).toThrow(/endsAt/u);
  });
});

describe(acceptedKeys, () => {
  it("leaves the development key out of an installed app", () => {
    expect(acceptedKeys(true)).not.toHaveProperty(DEV_KID);
    expect(acceptedKeys(false)).toHaveProperty(DEV_KID);
  });
});
