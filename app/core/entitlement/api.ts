import { z } from "zod";

/** Until the real endpoint is live; `MERU_ENTITLEMENT_URL` points a run at another. */
export const ENTITLEMENT_URL = "https://api.meru.app/entitlement/issue";

/** The body the app POSTs as JSON. */
export const issueRequestSchema = z.object({
  deviceId: z.string().min(1),
  licenseKey: z.string().min(1).nullable(),
});

/** A 200's body. */
export const issuedSchema = z.object({ token: z.string().min(1) });

/** A 4xx's body: why the API refused, such as unknownLicenseKey or malformedRequest. */
export const refusedSchema = z.object({
  error: z.object({ reason: z.string().min(1) }),
});
