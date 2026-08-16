import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deriveExtension } from "./index";

let workDir: string;

let sourceDir: string;

let derivedExtensionsDir: string;

let facadeScriptPath: string;

const manifest = {
  name: "Test Extension",
  version: "1.0.0",
  manifest_version: 3,
  key: "MIIBIjANBgkq",
  background: { service_worker: "background/background.js", type: "module" },
};

async function writeManifest(manifestSource: Record<string, unknown>) {
  await writeFile(path.join(sourceDir, "manifest.json"), JSON.stringify(manifestSource));
}

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "electron-extensions-"));

  sourceDir = path.join(workDir, "source");

  derivedExtensionsDir = path.join(workDir, "derived");

  facadeScriptPath = path.join(workDir, "facade.js");

  await mkdir(path.join(sourceDir, "background"), { recursive: true });

  await writeManifest(manifest);

  await writeFile(path.join(sourceDir, "background", "background.js"), "// background\n");

  await writeFile(path.join(sourceDir, "popup.html"), "<html><head></head></html>");

  await writeFile(facadeScriptPath, "// facade\n");
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

function derive() {
  return deriveExtension({ sourceDir, derivedExtensionsDir, facadeScriptPath });
}

describe("deriveExtension", () => {
  test("copies the extension and adds the facade to its contexts", async () => {
    const derivedDir = await derive();

    const derivedManifest = JSON.parse(
      await readFile(path.join(derivedDir, "manifest.json"), "utf8"),
    );

    expect(derivedManifest.background.service_worker).toBe("chrome-facade-service-worker.js");
    expect(derivedManifest.key).toBe(manifest.key);

    expect(
      await readFile(path.join(derivedDir, "chrome-facade-service-worker.js"), "utf8"),
    ).toContain('import "./chrome-facade.js";');

    expect(await readFile(path.join(derivedDir, "chrome-facade.js"), "utf8")).toBe("// facade\n");

    expect(await readFile(path.join(derivedDir, "popup.html"), "utf8")).toContain(
      '<script src="/chrome-facade.js"></script>',
    );

    expect(await readFile(path.join(derivedDir, "background", "background.js"), "utf8")).toBe(
      "// background\n",
    );
  });

  test("never writes to the directory it was handed", async () => {
    await derive();

    expect((await readdir(sourceDir)).sort()).toEqual([
      "background",
      "manifest.json",
      "popup.html",
    ]);

    expect(JSON.parse(await readFile(path.join(sourceDir, "manifest.json"), "utf8"))).toEqual(
      manifest,
    );

    expect(await readFile(path.join(sourceDir, "popup.html"), "utf8")).toBe(
      "<html><head></head></html>",
    );
  });

  test("derives the same directory every time, so a generated id stays stable", async () => {
    expect(await derive()).toBe(await derive());
  });

  test("derives a directory of its own per extension", async () => {
    const otherSourceDir = path.join(workDir, "other-source");

    await mkdir(otherSourceDir);

    await writeFile(path.join(otherSourceDir, "manifest.json"), JSON.stringify(manifest));

    const otherDerivedDir = await deriveExtension({
      sourceDir: otherSourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
    });

    expect(otherDerivedDir).not.toBe(await derive());
  });

  test("keeps the copy but refreshes the facade when nothing changed", async () => {
    const derivedDir = await derive();

    await writeFile(path.join(derivedDir, "background", "background.js"), "// stale\n");

    await writeFile(facadeScriptPath, "// rebuilt facade\n");

    await derive();

    expect(await readFile(path.join(derivedDir, "background", "background.js"), "utf8")).toBe(
      "// stale\n",
    );
    expect(await readFile(path.join(derivedDir, "chrome-facade.js"), "utf8")).toBe(
      "// rebuilt facade\n",
    );
  });

  test("copies again when the extension changed", async () => {
    const derivedDir = await derive();

    await writeFile(path.join(derivedDir, "background", "background.js"), "// stale\n");

    await writeManifest({ ...manifest, version: "2.0.0" });

    await derive();

    expect(await readFile(path.join(derivedDir, "background", "background.js"), "utf8")).toBe(
      "// background\n",
    );
    expect(JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")).version).toBe(
      "2.0.0",
    );
  });

  test("injects the facade into a page only once", async () => {
    const derivedDir = await derive();

    await derive();

    const page = await readFile(path.join(derivedDir, "popup.html"), "utf8");

    expect(page.split('<script src="/chrome-facade.js"></script>')).toHaveLength(2);
  });
});
