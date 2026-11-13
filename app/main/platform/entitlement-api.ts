import type { EntitlementApi } from "../../core/ports.ts";
import { err, ok } from "../../core/result.ts";
import { issuedSchema, refusedSchema } from "../../shared/entitlement/api.ts";

export type Fetch = (url: string, init: RequestInit) => Promise<Response>;

const TIMEOUT = 15_000;

const bodyOf = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
};

/** Asks the API at `url` over `fetch`: Electron's `net.fetch` in the app, which takes the system's proxy and certificates. */
export const createEntitlementApi = (options: {
  readonly url: string;
  readonly fetch: Fetch;
}): EntitlementApi => ({
  issue: async ({ licenseKey, deviceId }) => {
    let response: Response;
    try {
      response = await options.fetch(options.url, {
        body: JSON.stringify({ deviceId, licenseKey }),
        headers: { "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(TIMEOUT),
      });
    } catch (error) {
      return err({ detail: String(error), kind: "offline" });
    }
    const body = await bodyOf(response);
    if (response.ok) {
      const issued = issuedSchema.safeParse(body);
      return issued.success
        ? ok({ token: issued.data.token })
        : err({
            detail: `A ${response.status} without a token`,
            kind: "serverError",
          });
    }
    if (response.status >= 400 && response.status < 500) {
      const refused = refusedSchema.safeParse(body);
      return err({
        kind: "rejected",
        reason: refused.success
          ? refused.data.error.reason
          : `http${response.status}`,
      });
    }
    return err({ detail: `HTTP ${response.status}`, kind: "serverError" });
  },
});
