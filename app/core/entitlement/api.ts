import { z } from "zod";

import type { EntitlementAnswer } from "../ports.ts";
import { err, ok } from "../result.ts";

/** Until the real endpoint is live; `MERU_ENTITLEMENT_URL` points a run at another. */
export const ENTITLEMENT_URL = "https://api.meru.app/entitlement/issue";

/** The body the app POSTs as JSON. */
export const issueRequestSchema = z.object({
  deviceId: z.string().min(1),
  licenseKey: z.string().min(1).nullable(),
});

/** A 200's body. */
const issuedSchema = z.object({ token: z.string().min(1) });

/** A 4xx's body: why the API refused, such as unknownLicenseKey or malformedRequest. */
const refusedSchema = z.object({
  error: z.object({ reason: z.string().min(1) }),
});

/** What an answer of the API means: the token of a 2xx, the reason of a 4xx, and a server error for anything else, a 2xx without a token included. */
export const answerOf = (status: number, body: unknown): EntitlementAnswer => {
  if (status >= 200 && status < 300) {
    const issued = issuedSchema.safeParse(body);
    return issued.success
      ? ok({ token: issued.data.token })
      : err({ detail: `A ${status} without a token`, kind: "serverError" });
  }
  if (status >= 400 && status < 500) {
    const refused = refusedSchema.safeParse(body);
    return err({
      kind: "rejected",
      reason: refused.success ? refused.data.error.reason : `http${status}`,
    });
  }
  return err({ detail: `HTTP ${status}`, kind: "serverError" });
};
