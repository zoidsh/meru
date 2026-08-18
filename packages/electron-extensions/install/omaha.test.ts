import { describe, expect, test } from "bun:test";
import { buildCrxDownloadUrl, buildUpdateCheckUrl, fetchCrx, fetchCrxUpdate } from "./omaha";

const extensionId = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const chromeVersion = "146.0.0.0";

const codebaseUrl = "https://clients2.googleusercontent.com/crx/blobs/abc/EXT_8_12_32_33.crx";

/** An answer the way the endpoint sends one, around the update check under test. */
function createUpdateCheckResponse(updateCheckElement: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><gupdate xmlns="http://www.google.com/update2/response" protocol="2.0" server="prod"><daystart elapsed_days="7169" elapsed_seconds="44109"/><app appid="${extensionId}" cohort="1::" cohortname="" status="ok">${updateCheckElement}</app></gupdate>`,
  );
}

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

describe("buildUpdateCheckUrl", () => {
  test("asks what the endpoint serves for an id, naming the installed version", () => {
    const { origin, pathname, searchParams } = new URL(
      buildUpdateCheckUrl({ extensionId, chromeVersion, installedVersion: "8.11.0.0" }),
    );

    expect(origin + pathname).toBe("https://clients2.google.com/service/update2/crx");
    expect(searchParams.get("prodversion")).toBe(chromeVersion);
    expect(searchParams.get("x")).toBe(`id=${extensionId}&v=8.11.0.0&uc`);
    // The redirect is what turns the answer into the package itself, which is
    // the download this call exists to avoid
    expect(searchParams.get("response")).toBeNull();
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

describe("fetchCrxUpdate", () => {
  test("reads the version and the package URL the endpoint offers", async () => {
    const requests: string[] = [];

    const crxUpdate = await fetchCrxUpdate({
      extensionId,
      chromeVersion,
      installedVersion: "8.11.0.0",
      fetch: async (url) => {
        requests.push(url);

        return createUpdateCheckResponse(
          `<updatecheck _esbAllowlist="true" codebase="${codebaseUrl}" fp="1.3bd6" hash_sha256="3bd6" protected="0" size="17863744" status="ok" version="8.12.32.33"/>`,
        );
      },
    });

    expect(crxUpdate).toEqual({ status: "update", version: "8.12.32.33", codebaseUrl });
    expect(requests).toEqual([
      buildUpdateCheckUrl({ extensionId, chromeVersion, installedVersion: "8.11.0.0" }),
    ]);
  });

  test("reads the answer that nothing newer is served", async () => {
    expect(
      await fetchCrxUpdate({
        extensionId,
        chromeVersion,
        installedVersion: "8.12.32.33",
        fetch: async () =>
          createUpdateCheckResponse('<updatecheck _esbAllowlist="true" status="noupdate"/>'),
      }),
    ).toEqual({ status: "noupdate" });
  });

  test("refuses an answer that is not an update check", async () => {
    await expect(
      fetchCrxUpdate({
        extensionId,
        chromeVersion,
        installedVersion: "8.12.32.33",
        fetch: async () => new Response("<html><body>Try again later</body></html>"),
      }),
    ).rejects.toThrow(`Update endpoint answered an unreadable update check for ${extensionId}`);
  });

  test("names the no-package answer for an id the endpoint does not serve", async () => {
    await expect(
      fetchCrxUpdate({
        extensionId,
        chromeVersion,
        installedVersion: "8.12.32.33",
        fetch: async () =>
          new Response(
            `<?xml version="1.0" encoding="UTF-8"?><gupdate protocol="2.0"><app appid="${extensionId}" status="error-unknownApplication"/></gupdate>`,
          ),
      }),
    ).rejects.toThrow(`Update endpoint has no package for ${extensionId}`);
  });

  test("refuses an update that names no version", async () => {
    await expect(
      fetchCrxUpdate({
        extensionId,
        chromeVersion,
        installedVersion: "8.12.32.33",
        fetch: async () =>
          createUpdateCheckResponse(`<updatecheck codebase="${codebaseUrl}" status="ok"/>`),
      }),
    ).rejects.toThrow(`Update endpoint offered ${extensionId} without a version or a package URL`);
  });

  test("refuses an answer that is not an answer at all", async () => {
    await expect(
      fetchCrxUpdate({
        extensionId,
        chromeVersion,
        installedVersion: "8.12.32.33",
        fetch: async () => new Response("", { status: 503, statusText: "Service Unavailable" }),
      }),
    ).rejects.toThrow(`Update endpoint answered 503 Service Unavailable for ${extensionId}`);
  });
});
