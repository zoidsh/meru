import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { createCrx, extensionId, signingKeyPair, toBase64 } from "../crx/crx-fixture";
import { getExtensionIdFromManifestKey } from "../derive/extension-id";
import {
  getInstalledExtension,
  installExtension,
  installLatestExtension,
  pruneExtensionVersions,
  uninstallExtension,
} from "./index";
import type { FetchImplementation } from "./omaha";

const chromeVersion = "146.0.0.0";

let installDir: string;

let extensionInstallDir: string;

function encode(contents: string) {
  return new TextEncoder().encode(contents);
}

/** A package the way the Web Store serves one, hashes and all. */
function createExtensionCrx(version: string) {
  return createCrx({
    archive: Buffer.from(
      zipSync({
        "manifest.json": encode(JSON.stringify({ name: "Test Extension", version })),
        "background/background.js": encode("// background\n"),
        "_metadata/verified_contents.json": encode("[]"),
      }),
    ),
  });
}

function createUpdateCheckResponse(servedVersion: string | undefined) {
  const updateCheckElement = servedVersion
    ? `<updatecheck codebase="https://packages.test/extension.crx" status="ok" version="${servedVersion}"/>`
    : '<updatecheck status="noupdate"/>';

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><gupdate protocol="2.0"><app appid="${extensionId}" status="ok">${updateCheckElement}</app></gupdate>`,
  );
}

/**
 * The endpoint as an install meets it: the update check naming the version it
 * serves, and the package behind the download redirect. A fake without a
 * package fails the download, so a check that should have stopped at the update
 * check is caught rather than quietly downloading.
 */
function createFetch({ crx, servedVersion }: { crx?: Uint8Array; servedVersion?: string }) {
  const downloadedUrls: string[] = [];

  const fetch: FetchImplementation = async (url) => {
    if (new URL(url).searchParams.get("response") !== "redirect") {
      return createUpdateCheckResponse(servedVersion);
    }

    downloadedUrls.push(url);

    if (!crx) {
      throw new Error("Downloaded the package for an extension that is up to date");
    }

    return new Response(crx);
  };

  return { fetch, downloadedUrls };
}

async function readEntryNames(dirPath: string) {
  try {
    return (await readdir(dirPath, { recursive: true })).sort();
  } catch {
    return [];
  }
}

beforeEach(async () => {
  installDir = await mkdtemp(path.join(tmpdir(), "electron-extensions-"));

  extensionInstallDir = path.join(installDir, extensionId);
});

afterEach(async () => {
  await rm(installDir, { recursive: true, force: true });
});

describe("installExtension", () => {
  test("unpacks a verified package under its version", async () => {
    const { version, extensionDir } = await installExtension({
      crx: createExtensionCrx("1.2.3"),
      extensionId,
      installDir,
    });

    expect(version).toBe("1.2.3");
    expect(extensionDir).toBe(path.join(extensionInstallDir, "1.2.3"));

    expect(await readEntryNames(extensionInstallDir)).toEqual([
      "1.2.3",
      path.join("1.2.3", "background"),
      path.join("1.2.3", "background", "background.js"),
      path.join("1.2.3", "manifest.json"),
    ]);

    expect(await readFile(path.join(extensionDir, "background", "background.js"), "utf8")).toBe(
      "// background\n",
    );
  });

  test("injects the key the package was signed with, so it loads under the pinned id", async () => {
    const { extensionDir } = await installExtension({
      crx: createExtensionCrx("1.2.3"),
      extensionId,
      installDir,
    });

    const manifest = JSON.parse(await readFile(path.join(extensionDir, "manifest.json"), "utf8"));

    expect(manifest.key).toBe(toBase64(signingKeyPair.publicKey));
    expect(getExtensionIdFromManifestKey(manifest.key)).toBe(extensionId);
    expect(manifest.name).toBe("Test Extension");
  });

  test("leaves nothing behind when the package does not verify", async () => {
    const crx = createExtensionCrx("1.2.3");

    const tamperedByteOffset = crx.byteLength - 8;

    crx[tamperedByteOffset] = (crx[tamperedByteOffset] as number) ^ 0xff;

    await expect(installExtension({ crx, extensionId, installDir })).rejects.toThrow(
      `No signature by the key deriving ${extensionId} verifies the CRX`,
    );

    expect(await readEntryNames(extensionInstallDir)).toEqual([]);
  });

  test("refuses an id that is not one, before it reads the package", async () => {
    await expect(
      installExtension({
        crx: createExtensionCrx("1.2.3"),
        extensionId: "../elsewhere",
        installDir,
      }),
    ).rejects.toThrow("Not an extension id: ../elsewhere");
  });
});

describe("getInstalledExtension", () => {
  async function writeVersionDir(dirName: string) {
    await mkdir(path.join(extensionInstallDir, dirName), { recursive: true });

    await writeFile(path.join(extensionInstallDir, dirName, "manifest.json"), "{}");
  }

  test("reports nothing when the extension is not installed", async () => {
    expect(await getInstalledExtension({ installDir, extensionId })).toBeUndefined();
  });

  test("reports the newest version, counting components as numbers", async () => {
    await writeVersionDir("1.9.0");

    await writeVersionDir("1.10.0");

    await writeVersionDir("1.2.0");

    expect(await getInstalledExtension({ installDir, extensionId })).toEqual({
      version: "1.10.0",
      extensionDir: path.join(extensionInstallDir, "1.10.0"),
    });
  });

  test("passes over an interrupted install and a directory without a manifest", async () => {
    await writeVersionDir("1.0.0");

    await writeVersionDir("2.0.0.staging");

    await mkdir(path.join(extensionInstallDir, "3.0.0"));

    expect(await getInstalledExtension({ installDir, extensionId })).toEqual({
      version: "1.0.0",
      extensionDir: path.join(extensionInstallDir, "1.0.0"),
    });
  });

  test("refuses an id that is not one", async () => {
    await expect(
      getInstalledExtension({ installDir, extensionId: "../elsewhere" }),
    ).rejects.toThrow("Not an extension id: ../elsewhere");
  });
});

describe("installLatestExtension", () => {
  test("installs when nothing is installed yet", async () => {
    const { fetch, downloadedUrls } = createFetch({ crx: createExtensionCrx("1.0.0") });

    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch,
    });

    expect(latestExtension).toEqual({
      updated: true,
      version: "1.0.0",
      extensionDir: path.join(extensionInstallDir, "1.0.0"),
    });
    expect(downloadedUrls).toHaveLength(1);
  });

  test("downloads nothing when the endpoint serves the version already installed", async () => {
    const { extensionDir } = await installExtension({
      crx: createExtensionCrx("1.0.0"),
      extensionId,
      installDir,
    });

    await writeFile(path.join(extensionDir, "untouched"), "kept");

    const { fetch, downloadedUrls } = createFetch({ servedVersion: "1.0.0" });

    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch,
    });

    expect(latestExtension).toEqual({ updated: false, version: "1.0.0", extensionDir });
    expect(downloadedUrls).toEqual([]);
    expect(await readFile(path.join(extensionDir, "untouched"), "utf8")).toBe("kept");
  });

  test("downloads nothing when the endpoint answers that nothing is newer", async () => {
    await installExtension({ crx: createExtensionCrx("1.0.0"), extensionId, installDir });

    const { fetch, downloadedUrls } = createFetch({});

    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch,
    });

    expect(latestExtension.updated).toBe(false);
    expect(latestExtension.version).toBe("1.0.0");
    expect(downloadedUrls).toEqual([]);
  });

  test("installs a newer version and leaves the one it replaces on disk", async () => {
    await installExtension({ crx: createExtensionCrx("1.0.0"), extensionId, installDir });

    const { fetch } = createFetch({ crx: createExtensionCrx("2.0.0"), servedVersion: "2.0.0" });

    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch,
    });

    expect(latestExtension.updated).toBe(true);
    expect(latestExtension.version).toBe("2.0.0");

    // A session can still be deriving its copy from the version that was
    // replaced, so the launch-time prune is what drops it
    expect((await readdir(extensionInstallDir)).sort()).toEqual(["1.0.0", "2.0.0"]);
  });

  test("writes nothing when the package turns out to carry the installed version", async () => {
    const crx = createExtensionCrx("1.0.0");

    const { extensionDir } = await installExtension({ crx, extensionId, installDir });

    await writeFile(path.join(extensionDir, "untouched"), "kept");

    const { fetch } = createFetch({ crx, servedVersion: "2.0.0" });

    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch,
    });

    expect(latestExtension).toEqual({ updated: false, version: "1.0.0", extensionDir });
    expect(await readFile(path.join(extensionDir, "untouched"), "utf8")).toBe("kept");
  });

  test("fails the check rather than reporting up to date when the answer cannot be read", async () => {
    await installExtension({ crx: createExtensionCrx("1.0.0"), extensionId, installDir });

    await expect(
      installLatestExtension({
        extensionId,
        installDir,
        chromeVersion,
        fetch: async () => new Response("<html><body>Try again later</body></html>"),
      }),
    ).rejects.toThrow(`Update endpoint answered an unreadable update check for ${extensionId}`);
  });
});

describe("pruneExtensionVersions", () => {
  async function writeVersionDir(id: string, dirName: string) {
    await mkdir(path.join(installDir, id, dirName), { recursive: true });

    await writeFile(path.join(installDir, id, dirName, "manifest.json"), "{}");
  }

  test("keeps the newest version of every extension and drops what it replaced", async () => {
    const otherExtensionId = "otherextensionidwithnoversions";

    await writeVersionDir(extensionId, "1.0.0");

    await writeVersionDir(extensionId, "2.0.0");

    await writeVersionDir(otherExtensionId, "3.0.0");

    await pruneExtensionVersions({ installDir });

    expect(await readdir(extensionInstallDir)).toEqual(["2.0.0"]);
    expect(await readdir(path.join(installDir, otherExtensionId))).toEqual(["3.0.0"]);
  });

  test("drops what a crashed install left behind", async () => {
    await writeVersionDir(extensionId, "1.0.0");

    await writeVersionDir(extensionId, "2.0.0.staging");

    await mkdir(path.join(extensionInstallDir, "3.0.0"));

    await pruneExtensionVersions({ installDir });

    expect(await readdir(extensionInstallDir)).toEqual(["1.0.0"]);
  });

  test("does nothing when nothing is installed", async () => {
    await rm(installDir, { recursive: true, force: true });

    await pruneExtensionVersions({ installDir });

    expect(await readEntryNames(installDir)).toEqual([]);
  });
});

describe("uninstallExtension", () => {
  test("drops every version of the extension", async () => {
    await installExtension({ crx: createExtensionCrx("1.0.0"), extensionId, installDir });

    await installExtension({ crx: createExtensionCrx("2.0.0"), extensionId, installDir });

    await uninstallExtension({ installDir, extensionId });

    expect(await readEntryNames(extensionInstallDir)).toEqual([]);
    expect(await getInstalledExtension({ installDir, extensionId })).toBeUndefined();
  });

  test("refuses an id that is not one, rather than deleting what it climbs to", async () => {
    const outsideDir = path.join(installDir, "outside");

    await mkdir(outsideDir);

    await writeFile(path.join(outsideDir, "kept"), "kept");

    await expect(
      uninstallExtension({
        installDir: path.join(installDir, "extensions"),
        extensionId: "../outside",
      }),
    ).rejects.toThrow("Not an extension id: ../outside");

    expect(await readFile(path.join(outsideDir, "kept"), "utf8")).toBe("kept");
  });
});
