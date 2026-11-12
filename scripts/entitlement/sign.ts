import { createPrivateKey, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { z } from "zod";

import {
  claimFieldsSchema,
  claimsSchema,
} from "../../packages/app/core/entitlement/token.ts";
import type { Claims } from "../../packages/app/core/entitlement/token.ts";
import { DEV_KID } from "../../packages/app/shared/entitlement/keys.ts";

const DEV_KEY = path.join(import.meta.dirname, "dev-private.pem");

/** Claims as a person writes them: `iat` defaults to now and `exp` to `iat + ttl`. */
export const draftSchema = claimFieldsSchema.partial({
  exp: true,
  iat: true,
});

export type Draft = z.input<typeof draftSchema>;

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

/** Signs claims with the development key, or another PKCS#8 PEM, into a token the app accepts under `kid`. */
export const mintToken = (
  draft: Draft,
  {
    kid = DEV_KID,
    now = Date.now(),
    pem = readFileSync(DEV_KEY, "utf-8"),
  }: { kid?: string; now?: number; pem?: string } = {}
): string => {
  const parsed = draftSchema.parse(draft);
  const iat = parsed.iat ?? Math.floor(now / 1000);
  const claims: Claims = claimsSchema.parse({
    ...parsed,
    exp: parsed.exp ?? iat + parsed.ttl,
    iat,
  });
  const input = `${encode({ alg: "EdDSA", kid })}.${encode(claims)}`;
  const signature = sign(null, Buffer.from(input), createPrivateKey(pem));
  return `${input}.${signature.toString("base64url")}`;
};

const usage = `Usage: node scripts/entitlement/sign.ts <claims.json | ->

Prints a token signed with the development key. The claims are JSON with
sub, plan, deviceLimit, ttl, status and, as they apply, endsAt, seat and
reason; iat defaults to now and exp to iat + ttl.`;

const main = () => {
  const [source] = process.argv.slice(2);
  if (source === undefined || source === "--help") {
    console.log(usage);
    process.exit(source === undefined ? 1 : 0);
  }
  const text = readFileSync(source === "-" ? 0 : source, "utf-8");
  const draft = draftSchema.safeParse(JSON.parse(text));
  if (!draft.success) {
    console.error(z.prettifyError(draft.error));
    process.exit(1);
  }
  console.log(mintToken(draft.data));
};

if (import.meta.main) {
  main();
}
