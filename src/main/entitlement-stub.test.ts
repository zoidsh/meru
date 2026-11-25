import { createHash, createPrivateKey, createPublicKey } from "node:crypto";

import { describe, expect, it } from "vitest";

import { DAY } from "#core/entitlement.ts";
import { fakeTextFile } from "#platform/text-file.fake.ts";

import {
  DEV_PUBLIC_KEY,
  createStubEntitlementServer,
  signDevToken,
} from "./entitlement-stub.ts";
import { publicKeyFromRaw, verifyToken } from "./entitlement-token.ts";

const START = Date.UTC(2026, 10, 1);
const publicKey = publicKeyFromRaw(DEV_PUBLIC_KEY);

const setup = () => {
  const files = new Map<string, string>();
  let now = START;
  let offline = false;
  const server = createStubEntitlementServer({
    file: fakeTextFile("/data/entitlement-stub.json", files),
    now: () => now,
    offline: () => offline,
  });

  const read = (answer: Awaited<ReturnType<typeof server.refresh>>) =>
    "token" in answer
      ? verifyToken(answer.token, publicKey, "device")
      : answer.error;

  return {
    server,
    read,
    files,
    later: (ms: number) => {
      now += ms;
    },
    goOffline: () => {
      offline = true;
    },
  };
};

describe(createStubEntitlementServer, () => {
  it("signs with the public key it names", () => {
    const token = signDevToken({
      v: 1,
      tier: "pro",
      deviceId: "device",
      issuedAt: 1,
      expiresAt: 2,
    });

    expect(verifyToken(token, publicKey, "device")).toMatchObject({
      tier: "pro",
    });
  });

  it("names the public key the seed's pair holds", () => {
    const seed = createHash("sha256")
      .update("meru development entitlement key, public by design")
      .digest();
    const privateKey = createPrivateKey({
      key: Buffer.concat([
        Buffer.from("302e020100300506032b657004220420", "hex"),
        seed,
      ]),
      format: "der",
      type: "pkcs8",
    });

    expect(createPublicKey(privateKey).export({ format: "jwk" }).x).toBe(
      DEV_PUBLIC_KEY
    );
  });

  it("runs a trial 14 days from the device's first refresh, then ends it", async () => {
    const { server, read, later } = setup();

    expect(read(await server.refresh({ deviceId: "device" }))).toMatchObject({
      tier: "trial",
      trialEndsAt: START + 14 * DAY,
      expiresAt: START + 14 * DAY,
    });

    later(14 * DAY);

    expect(read(await server.refresh({ deviceId: "device" }))).toMatchObject({
      tier: "free",
      reason: "trialEnded",
    });
  });

  it("activates a key, answers for it after, and refuses one it never saw", async () => {
    const { server, read } = setup();

    expect(
      read(
        await server.activate({
          deviceId: "device",
          licenseKey: "MERU-ABCD-0001",
          deviceLabel: "Studio",
        })
      )
    ).toMatchObject({ tier: "pro", deviceLabel: "Studio" });
    expect(
      read(
        await server.refresh({
          deviceId: "device",
          licenseKey: "MERU-ABCD-0001",
        })
      )
    ).toMatchObject({ tier: "pro" });
    expect(
      read(
        await server.refresh({
          deviceId: "device",
          licenseKey: "MERU-ZZZZ-0001",
        })
      )
    ).toMatchObject({ tier: "free", reason: "licenseRefused" });
  });

  it("answers a used key with the device limit, a key of no license as invalid, and nothing offline", async () => {
    const { server, goOffline } = setup();
    const activate = (licenseKey: string) =>
      server.activate({
        deviceId: "device",
        licenseKey,
        deviceLabel: "Studio",
      });

    await expect(activate("MERU-USED-0001")).resolves.toStrictEqual({
      error: "deviceLimit",
    });
    await expect(activate("MERU-0000-0001")).resolves.toStrictEqual({
      error: "invalidKey",
    });

    goOffline();

    await expect(server.refresh({ deviceId: "device" })).resolves.toStrictEqual(
      {
        error: "offline",
      }
    );
  });
});
