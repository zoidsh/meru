import { afterEach, describe, expect, test } from "bun:test";
import { WEB_NAVIGATION_PATHS } from "../../web-navigation/bridge-protocol";
import { createWebNavigation } from "./web-navigation";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type FrameQueryMethod = (details: Record<string, unknown>) => Promise<unknown>;

describe("facade webNavigation", () => {
  test("asks the bridge and answers what it said", async () => {
    const requests: { pathName: string; body: unknown }[] = [];

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      requests.push({
        pathName: new URL(url).pathname,
        body: JSON.parse(init.body as string),
      });

      return Response.json({ frameId: 42, parentFrameId: 0 });
    }) as typeof fetch;

    const getFrame = createWebNavigation().getFrame as FrameQueryMethod;

    expect(await getFrame({ tabId: 12, frameId: 42 })).toEqual({ frameId: 42, parentFrameId: 0 });

    expect(requests).toEqual([
      {
        pathName: WEB_NAVIGATION_PATHS.getFrame,
        body: { details: { tabId: 12, frameId: 42 } },
      },
    ]);
  });

  test("answers null when the bridge is unreachable or refuses", async () => {
    globalThis.fetch = (async () => {
      throw new Error("Failed to fetch");
    }) as unknown as typeof fetch;

    const webNavigation = createWebNavigation();

    expect(
      await (webNavigation.getFrame as FrameQueryMethod)({ tabId: 12, frameId: 0 }),
    ).toBeNull();

    globalThis.fetch = (async () => new Response(null, { status: 403 })) as unknown as typeof fetch;

    expect(await (webNavigation.getAllFrames as FrameQueryMethod)({ tabId: 12 })).toBeNull();
  });
});
