import { z } from "zod";

import { err, ok } from "../result.ts";
import type { Result } from "../result.ts";

export const tokenHeaderSchema = z.object({
  alg: z.literal("EdDSA"),
  /** Which accepted public key signed the token. */
  kid: z.string().min(1),
});

/** Seconds since the epoch, as JWT's NumericDate counts. */
const secondsSchema = z.number().int().nonnegative();

export const claimsSchema = z
  .object({
    deviceLimit: z.number().int().nonnegative(),
    /** The trial's end; present only on a trial. */
    endsAt: secondsSchema.optional(),
    exp: secondsSchema,
    iat: secondsSchema,
    plan: z.enum(["trial", "pro", "team"]),
    /** Why the license is disabled, such as refunded, revoked or deviceLimit; present only when it is. */
    reason: z.string().min(1).optional(),
    seat: z.string().min(1).optional(),
    status: z.enum(["active", "disabled"]),
    /** The device id the token was issued to. */
    sub: z.string().min(1),
    /** The lifetime in seconds the server issued the token with. */
    ttl: z.number().int().positive(),
  })
  .refine((claims) => claims.plan !== "trial" || claims.endsAt !== undefined, {
    message: "A trial has no endsAt",
    path: ["endsAt"],
  })
  .refine(
    (claims) => claims.status !== "disabled" || claims.reason !== undefined,
    { message: "A disabled token has no reason", path: ["reason"] }
  );

export type TokenHeader = z.infer<typeof tokenHeaderSchema>;

export type Claims = z.infer<typeof claimsSchema>;

export interface ParsedToken {
  readonly header: TokenHeader;
  readonly claims: Claims;
  /** The bytes the signature covers: the header and claims parts as they appear in the token, joined by a dot. */
  readonly signingInput: Uint8Array<ArrayBuffer>;
  readonly signature: Uint8Array<ArrayBuffer>;
}

export interface Malformed {
  readonly kind: "malformed";
  readonly detail: string;
}

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const BASE64URL = /^[\w-]*$/u;

/** Decodes unpadded base64url, refusing any other spelling of the same bytes so a token has one encoding. */
export const decodeBase64Url = (
  text: string
): Uint8Array<ArrayBuffer> | undefined => {
  if (!BASE64URL.test(text) || text.length % 4 === 1) {
    return undefined;
  }
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let carry = 0;
  let bits = 0;
  let index = 0;
  for (const char of text) {
    carry = carry * 64 + ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      const unit = 2 ** bits;
      bytes[index] = Math.floor(carry / unit);
      index += 1;
      carry %= unit;
    }
  }
  return carry === 0 ? bytes : undefined;
};

// Core compiles without TextDecoder; decodeURIComponent is the standard library's UTF-8 decoder and refuses an invalid sequence.
const decodeUtf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return decodeURIComponent(
      Array.from(
        bytes,
        (byte) => `%${byte.toString(16).padStart(2, "0")}`
      ).join("")
    );
  } catch {
    return undefined;
  }
};

const ascii = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(text, (char) => char.codePointAt(0) ?? 0);

const json = <S extends z.ZodType>(
  part: string,
  schema: S,
  name: string
): Result<z.output<S>, Malformed> => {
  const bytes = decodeBase64Url(part);
  const text = bytes === undefined ? undefined : decodeUtf8(bytes);
  if (text === undefined) {
    return err({ detail: `The ${name} is not base64url`, kind: "malformed" });
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return err({ detail: `The ${name} is not JSON`, kind: "malformed" });
  }
  const parsed = schema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err({
        detail: `The ${name} does not parse: ${parsed.error.message}`,
        kind: "malformed",
      });
};

/** Splits a token into its parts and parses each, trusting none of them yet. */
export const parseToken = (text: string): Result<ParsedToken, Malformed> => {
  const parts = text.split(".");
  const [headerPart, claimsPart, signaturePart] = parts;
  if (
    parts.length !== 3 ||
    headerPart === undefined ||
    claimsPart === undefined ||
    signaturePart === undefined
  ) {
    return err({ detail: "A token has three parts", kind: "malformed" });
  }
  const header = json(headerPart, tokenHeaderSchema, "header");
  if (!header.ok) {
    return header;
  }
  const claims = json(claimsPart, claimsSchema, "claims");
  if (!claims.ok) {
    return claims;
  }
  const signature = decodeBase64Url(signaturePart);
  if (signature === undefined) {
    return err({
      detail: "The signature is not base64url",
      kind: "malformed",
    });
  }
  return ok({
    claims: claims.value,
    header: header.value,
    signature,
    signingInput: ascii(`${headerPart}.${claimsPart}`),
  });
};
