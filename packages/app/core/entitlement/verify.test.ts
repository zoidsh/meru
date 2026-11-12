import { describe, expect, it } from "vitest";

import type { Claims } from "./token.ts";
import { parseToken } from "./token.ts";
import { verifyToken } from "./verify.ts";

const DEVICE = "device-1";
const KID = "test-1";
const NOW = 1_800_000_000_000;
const SKEW = 60;

const generate = async () => {
  const pair = await crypto.subtle.generateKey("Ed25519", true, [
    "sign",
    "verify",
  ]);
  if (!("privateKey" in pair)) {
    throw new Error("Ed25519 gave one key, not a pair");
  }
  return pair;
};

const signer = await generate();
const stranger = await generate();
const keys = new Map([[KID, signer.publicKey]]);

const encode = (value: unknown) =>
  Buffer.from(
    typeof value === "string" ? value : JSON.stringify(value)
  ).toString("base64url");

const claims = (overrides: Partial<Claims> = {}): Claims => ({
  deviceLimit: 3,
  exp: NOW / 1000 + 3 * 3600,
  iat: NOW / 1000,
  plan: "pro",
  status: "active",
  sub: DEVICE,
  ttl: 3 * 3600,
  ...overrides,
});

const sign = async (
  payload: unknown,
  {
    header = { alg: "EdDSA", kid: KID },
    key = signer.privateKey,
  }: { header?: unknown; key?: typeof signer.privateKey } = {}
) => {
  const input = `${encode(header)}.${encode(payload)}`;
  const signature = await crypto.subtle.sign(
    "Ed25519",
    key,
    Buffer.from(input)
  );
  return `${input}.${Buffer.from(signature).toString("base64url")}`;
};

const verify = async (token: string, now = NOW) =>
  await verifyToken(token, {
    deviceId: DEVICE,
    keys,
    now,
    skewSeconds: SKEW,
    subtle: crypto.subtle,
  });

describe(verifyToken, () => {
  it("accepts a token signed by an accepted key for this device", async () => {
    const issued = claims({ seat: "seat-7" });
    await expect(verify(await sign(issued))).resolves.toStrictEqual({
      ok: true,
      value: issued,
    });
  });

  it("refuses a key id it does not hold", async () => {
    const token = await sign(claims(), {
      header: { alg: "EdDSA", kid: "retired" },
    });
    await expect(verify(token)).resolves.toStrictEqual({
      error: { kid: "retired", kind: "unknownKey" },
      ok: false,
    });
  });

  it("refuses a signature by another key under an accepted key id", async () => {
    const token = await sign(claims(), { key: stranger.privateKey });
    await expect(verify(token)).resolves.toStrictEqual({
      error: { kind: "badSignature" },
      ok: false,
    });
  });

  it.each([
    ["header", 0, encode({ alg: "EdDSA", kid: KID, typ: "JWT" })],
    ["claims", 1, encode(claims({ plan: "team" }))],
    ["signature", 2, Buffer.alloc(64).toString("base64url")],
  ])("refuses a token whose %s was changed", async (_part, index, part) => {
    const token = await sign(claims());
    const parts = token.split(".");
    parts[index] = part;
    await expect(verify(parts.join("."))).resolves.toStrictEqual({
      error: { kind: "badSignature" },
      ok: false,
    });
  });

  it("refuses a signature of the wrong length", async () => {
    const token = await sign(claims());
    const [header, payload] = token.split(".");
    await expect(
      verify(`${header}.${payload}.${encode("short")}`)
    ).resolves.toStrictEqual({ error: { kind: "badSignature" }, ok: false });
  });

  it("refuses a token issued to another device", async () => {
    const token = await sign(claims({ sub: "device-2" }));
    await expect(verify(token)).resolves.toStrictEqual({
      error: { kind: "wrongDevice", sub: "device-2" },
      ok: false,
    });
  });

  it("holds an expired token's claims beside the error", async () => {
    const issued = claims({ exp: NOW / 1000 - 3600 });
    await expect(verify(await sign(issued))).resolves.toStrictEqual({
      error: { claims: issued, kind: "expired" },
      ok: false,
    });
  });

  it("accepts a token until the skew past its expiry, and not at it", async () => {
    const issued = claims({ exp: NOW / 1000 });
    const token = await sign(issued);
    await expect(verify(token, NOW + SKEW * 1000 - 1)).resolves.toMatchObject({
      ok: true,
    });
    await expect(verify(token, NOW + SKEW * 1000)).resolves.toMatchObject({
      error: { kind: "expired" },
      ok: false,
    });
  });

  it.each([
    ["no parts", "nothing"],
    ["four parts", "a.b.c.d"],
    ["a header that is not base64url", "a+b.e30.AA"],
    ["a header that is not JSON", `${encode("{")}.e30.AA`],
    ["another algorithm", `${encode({ alg: "HS256", kid: KID })}.e30.AA`],
    [
      "claims missing a field",
      `${encode({ alg: "EdDSA", kid: KID })}.${encode({ sub: DEVICE })}.AA`,
    ],
    [
      "a trial with no end",
      `${encode({ alg: "EdDSA", kid: KID })}.${encode(claims({ plan: "trial" }))}.AA`,
    ],
    [
      "a disabled token with no reason",
      `${encode({ alg: "EdDSA", kid: KID })}.${encode(claims({ status: "disabled" }))}.AA`,
    ],
    [
      "a signature that is not base64url",
      `${encode({ alg: "EdDSA", kid: KID })}.${encode(claims())}.A=`,
    ],
  ])("calls a token with %s malformed", async (_name, token) => {
    await expect(verify(token)).resolves.toMatchObject({
      error: { kind: "malformed" },
      ok: false,
    });
  });
});

describe(parseToken, () => {
  it("keeps the signed bytes as they appear in the token", async () => {
    const token = await sign(claims());
    const parsed = parseToken(token);
    expect(parsed.ok && Buffer.from(parsed.value.signingInput).toString()).toBe(
      token.split(".").slice(0, 2).join(".")
    );
  });

  it("refuses base64url with stray bits, another spelling of the same bytes", () => {
    const header = encode({ alg: "EdDSA", kid: KID });
    // "AB" decodes to one byte with four bits left over, which must be zero.
    expect(parseToken(`${header}.${encode(claims())}.AB`)).toMatchObject({
      error: { kind: "malformed" },
      ok: false,
    });
  });
});
