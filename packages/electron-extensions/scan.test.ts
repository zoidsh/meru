import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findExtensionDirs } from "./scan";

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
