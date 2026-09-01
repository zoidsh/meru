import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FIXTURE_EXTENSION_ID } from "./fixture/id";
import fixtureManifest from "./fixture/manifest.json";
import { findExtensionDirs, readExtensionDirId } from "./scan";

let workDir: string;

beforeEach(async () => {
  workDir = await realpath(await mkdtemp(path.join(tmpdir(), "electron-extensions-scan-")));
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function createExtensionDir(dirPath: string) {
  await mkdir(dirPath, { recursive: true });

  await writeFile(path.join(dirPath, "manifest.json"), JSON.stringify({ name: "Extension" }));

  return dirPath;
}

describe("findExtensionDirs", () => {
  test("finds every subdirectory with a manifest, in a stable order", async () => {
    const onePasswordDir = await createExtensionDir(path.join(workDir, "1password"));

    const bitwardenDir = await createExtensionDir(path.join(workDir, "bitwarden"));

    expect(findExtensionDirs(workDir)).toEqual([onePasswordDir, bitwardenDir]);
  });

  test("skips subdirectories without a manifest and files", async () => {
    const onePasswordDir = await createExtensionDir(path.join(workDir, "1password"));

    await mkdir(path.join(workDir, "not-an-extension"));

    await writeFile(path.join(workDir, "README.md"), "# Extensions\n");

    expect(findExtensionDirs(workDir)).toEqual([onePasswordDir]);
  });

  test("resolves an extension symlinked into the directory", async () => {
    const onePasswordDir = await createExtensionDir(path.join(workDir, "source", "1password"));

    const extensionsDir = path.join(workDir, "extensions");

    await mkdir(extensionsDir);

    await symlink(onePasswordDir, path.join(extensionsDir, "1password"));

    expect(findExtensionDirs(extensionsDir)).toEqual([onePasswordDir]);
  });

  test("returns nothing for an empty or missing directory", async () => {
    expect(findExtensionDirs(workDir)).toEqual([]);
    expect(findExtensionDirs(path.join(workDir, "missing"))).toEqual([]);
  });
});

describe("readExtensionDirId", () => {
  test("reads the id the manifest key derives", async () => {
    const extensionDir = path.join(workDir, "fixture");

    await mkdir(extensionDir);

    await writeFile(
      path.join(extensionDir, "manifest.json"),
      JSON.stringify({ name: "Extension", key: fixtureManifest.key }),
    );

    expect(readExtensionDirId(extensionDir)).toBe(FIXTURE_EXTENSION_ID);
  });

  test("reads nothing from a manifest without a key", async () => {
    const extensionDir = await createExtensionDir(path.join(workDir, "keyless"));

    expect(readExtensionDirId(extensionDir)).toBeUndefined();
  });

  test("reads nothing from a missing or unparsable manifest", async () => {
    const extensionDir = path.join(workDir, "broken");

    await mkdir(extensionDir);

    expect(readExtensionDirId(extensionDir)).toBeUndefined();

    await writeFile(path.join(extensionDir, "manifest.json"), "{");

    expect(readExtensionDirId(extensionDir)).toBeUndefined();
  });
});
