import { describe, expect, test } from "bun:test";
import { buildCrxDownloadUrl, fetchCrx } from "./omaha";

const extensionId = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const chromeVersion = "146.0.0.0";

describe("buildCrxDownloadUrl", () => {
  test("asks for the package of one id as the given Chrome", () => {
    const { origin, pathname, searchParams } = new URL(
      buildCrxDownloadUrl({ extensionId, chromeVersion }),
    );

    expect(origin + pathname).toBe("https://clients2.google.com/service/update2/crx");
    expect(searchParams.get("prodversion")).toBe(chromeVersion);
    expect(searchParams.get("acceptformat")).toBe("crx2,crx3");
    expect(searchParams.get("response")).toBe("redirect");
    expect(searchParams.get("x")).toBe(`id=${extensionId}&installsource=ondemand&uc`);
  });
});

describe("fetchCrx", () => {
  test("downloads the package the endpoint redirects to", async () => {
    const requests: { url: string; redirect: string }[] = [];

    const crx = await fetchCrx({
      extensionId,
      chromeVersion,
      fetch: async (url, init) => {
        requests.push({ url, redirect: init.redirect });

        return new Response(Uint8Array.from([1, 2, 3]));
      },
    });

    expect(crx).toEqual(Uint8Array.from([1, 2, 3]));
    expect(requests).toEqual([
      { url: buildCrxDownloadUrl({ extensionId, chromeVersion }), redirect: "follow" },
    ]);
  });

  test("names the endpoint's no-package answer for what it is", async () => {
    await expect(
      fetchCrx({
        extensionId,
        chromeVersion,
        fetch: async () => new Response(null, { status: 204 }),
      }),
    ).rejects.toThrow(`Update endpoint has no package for ${extensionId}`);
  });

  test("refuses an answer that is not a package", async () => {
    await expect(
      fetchCrx({
        extensionId,
        chromeVersion,
        fetch: async () => new Response("", { status: 503, statusText: "Service Unavailable" }),
      }),
    ).rejects.toThrow(`Update endpoint answered 503 Service Unavailable for ${extensionId}`);
  });
});
