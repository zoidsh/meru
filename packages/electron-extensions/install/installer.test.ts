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

function createFetch(crx: Uint8Array): FetchImplementation {
  return async () => new Response(crx);
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
});

describe("installLatestExtension", () => {
  test("installs when nothing is installed yet", async () => {
    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch: createFetch(createExtensionCrx("1.0.0")),
    });

    expect(latestExtension).toEqual({
      updated: true,
      version: "1.0.0",
      extensionDir: path.join(extensionInstallDir, "1.0.0"),
    });
  });

  test("writes nothing when the served version is already installed", async () => {
    const crx = createExtensionCrx("1.0.0");

    const { extensionDir } = await installExtension({ crx, extensionId, installDir });

    await writeFile(path.join(extensionDir, "untouched"), "kept");

    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch: createFetch(crx),
    });

    expect(latestExtension).toEqual({ updated: false, version: "1.0.0", extensionDir });
    expect(await readFile(path.join(extensionDir, "untouched"), "utf8")).toBe("kept");
  });

  test("installs a newer version and drops the one it replaces", async () => {
    await installExtension({ crx: createExtensionCrx("1.0.0"), extensionId, installDir });

    const latestExtension = await installLatestExtension({
      extensionId,
      installDir,
      chromeVersion,
      fetch: createFetch(createExtensionCrx("2.0.0")),
    });

    expect(latestExtension.updated).toBe(true);
    expect(latestExtension.version).toBe("2.0.0");
    expect(await readdir(extensionInstallDir)).toEqual(["2.0.0"]);
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
});
