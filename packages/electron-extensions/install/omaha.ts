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
 * What every request to the endpoint carries besides the extension. The
 * platform parameters describe the browser asking rather than the machine, and
 * every extension Meru curates ships one package for all of them, so they are
 * constants.
 */
function buildEndpointParams(chromeVersion: string) {
  return {
    os: "linux",
    arch: "x64",
    os_arch: "x86_64",
    nacl_arch: "x86-64",
    prod: "chromiumcrx",
    prodchannel: "unknown",
    prodversion: chromeVersion,
    acceptformat: "crx2,crx3",
  };
}

/**
 * The Omaha URL serving the newest package for an extension id. The request
 * names no installed version, so the endpoint always answers with the package
 * rather than with "nothing newer".
 */
export function buildCrxDownloadUrl({ extensionId, chromeVersion }: CrxDownloadOptions) {
  const searchParams = new URLSearchParams({
    ...buildEndpointParams(chromeVersion),
    response: "redirect",
    x: `id=${extensionId}&installsource=ondemand&uc`,
  });

  return `${CRX_UPDATE_ENDPOINT}?${searchParams}`;
}

export type UpdateCheckOptions = CrxDownloadOptions & {
  /** The version on disk, which the endpoint answers `noupdate` to when it serves nothing newer. */
  installedVersion: string;
};

/**
 * The same endpoint asked what it serves rather than asked for it. Without
 * `response=redirect` the answer is the update check document instead of a
 * redirect to the package, which is what makes a check cost a few hundred bytes.
 */
export function buildUpdateCheckUrl({
  extensionId,
  chromeVersion,
  installedVersion,
}: UpdateCheckOptions) {
  const searchParams = new URLSearchParams({
    ...buildEndpointParams(chromeVersion),
    x: `id=${extensionId}&v=${installedVersion}&uc`,
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

  // No Content is the endpoint's no: an id it does not serve, or a request it
  // could not place — and it counts as `ok`, so left alone it would surface as
  // a verification error about an empty package
  if (response.status === 204) {
    throw new Error(`Update endpoint has no package for ${extensionId}`);
  }

  if (!response.ok) {
    throw new Error(
      `Update endpoint answered ${response.status} ${response.statusText} for ${extensionId}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

export type CrxUpdate =
  /** The version the endpoint serves, newer than the one the check named. */
  | { status: "update"; version: string; codebaseUrl: string }
  /** The endpoint serves nothing newer than the installed version. */
  | { status: "noupdate" };

function readElementAttributes(element: string) {
  const attributes: Record<string, string> = {};

  for (const [, name = "", value = ""] of element.matchAll(/([\w-]+)="([^"]*)"/g)) {
    attributes[name] = value;
  }

  return attributes;
}

/**
 * Reads the update check out of the endpoint's answer, the `gupdate` document
 * the update protocol replies to a version query with:
 *
 *   <gupdate protocol="2.0"><app appid="…" status="ok">
 *     <updatecheck codebase="https://…crx" version="8.12.32.33" status="ok"/>
 *   </app></gupdate>
 *
 * Everything that is neither an update nor a `noupdate` throws, so an answer
 * that could not be read never passes for up to date and never installs.
 */
function parseUpdateCheck(responseBody: string, extensionId: string): CrxUpdate {
  if (!responseBody.includes("<gupdate")) {
    throw new Error(`Update endpoint answered an unreadable update check for ${extensionId}`);
  }

  const updateCheckElement = responseBody.match(/<updatecheck\b[^>]*>/)?.[0];

  // An id the endpoint does not serve comes back as an app element carrying an
  // error status and no update check at all
  if (!updateCheckElement) {
    throw new Error(`Update endpoint has no package for ${extensionId}`);
  }

  const { status, version, codebase } = readElementAttributes(updateCheckElement);

  if (status === "noupdate") {
    return { status: "noupdate" };
  }

  if (status !== "ok") {
    throw new Error(`Update endpoint has no package for ${extensionId}`);
  }

  if (!version || !codebase) {
    throw new Error(`Update endpoint offered ${extensionId} without a version or a package URL`);
  }

  return { status: "update", version, codebaseUrl: codebase };
}

export type FetchCrxUpdateOptions = UpdateCheckOptions & {
  /** Injectable the way `fetchCrx` takes one, and for the same reasons. */
  fetch?: FetchImplementation;
};

/**
 * Asks the endpoint which version it serves for an extension, an answer of a
 * few hundred bytes where the package is tens of megabytes. This is what keeps
 * a check cheap enough to run on a schedule and on a button.
 *
 * The version it answers with is the endpoint's word rather than a verified
 * one, and nothing installs off it: it only decides whether `fetchCrx` runs,
 * and the package that brings back still has to pass `verifyCrx`.
 */
export async function fetchCrxUpdate({
  extensionId,
  chromeVersion,
  installedVersion,
  fetch = globalThis.fetch,
}: FetchCrxUpdateOptions) {
  const response = await fetch(
    buildUpdateCheckUrl({ extensionId, chromeVersion, installedVersion }),
    { redirect: "follow" },
  );

  if (response.status === 204) {
    throw new Error(`Update endpoint has no package for ${extensionId}`);
  }

  if (!response.ok) {
    throw new Error(
      `Update endpoint answered ${response.status} ${response.statusText} for ${extensionId}`,
    );
  }

  return parseUpdateCheck(await response.text(), extensionId);
}
