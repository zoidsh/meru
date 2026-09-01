import { afterEach, describe, expect, test } from "bun:test";
import {
  EXTENSION_BRIDGE_ORIGIN,
  EXTENSION_BRIDGE_TOKEN_GLOBAL,
  EXTENSION_BRIDGE_TOKEN_PARAM,
} from "../../bridge/protocol";
import { postBridge } from "./bridge";

const BRIDGE_TOKEN = "bridge-token";

const originalFetch = globalThis.fetch;

const tokenGlobal = globalThis as unknown as Record<string, string | undefined>;

afterEach(() => {
  globalThis.fetch = originalFetch;

  delete tokenGlobal[EXTENSION_BRIDGE_TOKEN_GLOBAL];
});

function stubFetch() {
  const requests: { url: string; init: RequestInit }[] = [];

  globalThis.fetch = (async (url: string, init: RequestInit) => {
    requests.push({ url, init });

    return new Response(null, { status: 204 });
  }) as unknown as typeof fetch;

  return requests;
}

describe("postBridge", () => {
  test("carries the token on the query string and leaves it out of the body", async () => {
    const requests = stubFetch();

    tokenGlobal[EXTENSION_BRIDGE_TOKEN_GLOBAL] = BRIDGE_TOKEN;

    await postBridge("/native-messaging/post", { portId: "port-1" });

    const [request] = requests;

    expect(request?.url).toBe(
      `${EXTENSION_BRIDGE_ORIGIN}/native-messaging/post?${EXTENSION_BRIDGE_TOKEN_PARAM}=${BRIDGE_TOKEN}`,
    );

    // The bridge refuses an unknown token off the URL alone, so nothing about
    // authentication may depend on the body being read
    expect(JSON.parse(request?.init.body as string)).toEqual({ portId: "port-1" });
  });

  test("escapes a token the query string would otherwise take apart", async () => {
    const requests = stubFetch();

    tokenGlobal[EXTENSION_BRIDGE_TOKEN_GLOBAL] = "a&b=c d";

    await postBridge("/echo", {});

    expect(new URL(requests[0]?.url as string).searchParams.get(EXTENSION_BRIDGE_TOKEN_PARAM)).toBe(
      "a&b=c d",
    );
  });

  test("sends an empty token where the derived copy left none", async () => {
    const requests = stubFetch();

    await postBridge("/echo", {});

    expect(new URL(requests[0]?.url as string).searchParams.get(EXTENSION_BRIDGE_TOKEN_PARAM)).toBe(
      "",
    );
  });
});
