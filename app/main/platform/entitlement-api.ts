import { answerOf } from "../../core/entitlement/api.ts";
import type { EntitlementApi } from "../../core/ports.ts";
import { err } from "../../core/result.ts";

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
    return answerOf(response.status, await bodyOf(response));
  },
});
