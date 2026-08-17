const CRX_UPDATE_ENDPOINT = "https://clients2.google.com/service/update2/crx";

export type CrxDownloadOptions = {
  extensionId: string;
  /**
   * The Chrome version the request speaks for, `process.versions.chrome` in an
   * Electron app. The endpoint answers 204 No Content without it, since it has
   * no way to tell which package a browser it knows nothing about can run.
   */
  chromeVersion: string;
};

/**
 * The Omaha URL serving the newest package for an extension id. The same
 * request is the update check: there is no separate "what is the latest
 * version" call, the answer is the package itself and its manifest carries the
 * version.
 *
 * The platform parameters describe the browser asking rather than the machine,
 * and every extension Meru curates ships one package for all of them, so they
 * are constants.
 */
export function buildCrxDownloadUrl({ extensionId, chromeVersion }: CrxDownloadOptions) {
  const searchParams = new URLSearchParams({
    response: "redirect",
    os: "linux",
    arch: "x64",
    os_arch: "x86_64",
    nacl_arch: "x86-64",
    prod: "chromiumcrx",
    prodchannel: "unknown",
    prodversion: chromeVersion,
    acceptformat: "crx2,crx3",
    x: `id=${extensionId}&installsource=ondemand&uc`,
  });

  return `${CRX_UPDATE_ENDPOINT}?${searchParams}`;
}

/**
 * As much of `fetch` as a download needs. Structural rather than `typeof fetch`
 * so a caller can hand over a plain function — a test's fake above all —
 * without matching every property a runtime hangs off its global.
 */
export type FetchImplementation = (url: string, init: { redirect: "follow" }) => Promise<Response>;

export type FetchCrxOptions = CrxDownloadOptions & {
  /**
   * Injectable so tests never reach the network, and so an embedder can send
   * the request through a fetch of its own.
   */
  fetch?: FetchImplementation;
};

/**
 * Downloads the newest package for an extension id. The endpoint answers with a
 * redirect to Google's CDN, so redirects have to be followed.
 *
 * Nothing here decides whether the bytes are a package worth having: an answer
 * that is not a CRX signed for this id fails in `verifyCrx`, which is the only
 * place allowed to say a package is good.
 */
export async function fetchCrx({
  extensionId,
  chromeVersion,
  fetch = globalThis.fetch,
}: FetchCrxOptions) {
  const response = await fetch(buildCrxDownloadUrl({ extensionId, chromeVersion }), {
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `Update endpoint answered ${response.status} ${response.statusText} for ${extensionId}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}
