import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deriveExtension, pruneDerivedExtensions } from "./index";

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

let writeCount = 0;

/**
 * Gives every write an mtime of its own, so a rewrite is a change the derive
 * can see whatever the filesystem's timestamp granularity is.
 */
async function writeSourceFile(fileName: string, content: string) {
  const filePath = path.join(sourceDir, fileName);

  await writeFile(filePath, content);

  writeCount += 1;

  const writtenAt = new Date(Date.now() + writeCount * 1000);

  await utimes(filePath, writtenAt, writtenAt);
}

async function writeManifest(manifestSource: Record<string, unknown>) {
  await writeSourceFile("manifest.json", JSON.stringify(manifestSource));
}

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "electron-extensions-"));

  sourceDir = path.join(workDir, "source");

  derivedExtensionsDir = path.join(workDir, "derived");

  facadeScriptPath = path.join(workDir, "facade.js");

  await mkdir(path.join(sourceDir, "background"), { recursive: true });

  await writeManifest(manifest);

  await writeSourceFile(path.join("background", "background.js"), "// background\n");

  await writeSourceFile("popup.html", "<html><head></head></html>");

  await writeFile(facadeScriptPath, "// facade\n");
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function derive() {
  return (await deriveExtension({ sourceDir, derivedExtensionsDir, facadeScriptPath })).derivedDir;
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

    expect(await readFile(path.join(derivedDir, "chrome-facade.js"), "utf8")).toEndWith(
      "// facade\n",
    );

    expect(await readFile(path.join(derivedDir, "popup.html"), "utf8")).toContain(
      '<script src="/chrome-facade.js"></script>',
    );

    expect(await readFile(path.join(derivedDir, "background", "background.js"), "utf8")).toBe(
      "// background\n",
    );
  });

  test("injects the facade into pages of every name Chromium serves", async () => {
    await writeSourceFile("options.htm", "<html><head></head></html>");

    await writeSourceFile("Onboarding.HTML", "<html><head></head></html>");

    const derivedDir = await derive();

    for (const pageFileName of ["options.htm", "Onboarding.HTML"]) {
      expect(await readFile(path.join(derivedDir, pageFileName), "utf8")).toContain(
        '<script src="/chrome-facade.js"></script>',
      );
    }
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

    const { derivedDir: otherDerivedDir } = await deriveExtension({
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
    expect(await readFile(path.join(derivedDir, "chrome-facade.js"), "utf8")).toEndWith(
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

  test("copies again when a file other than the manifest changed", async () => {
    const derivedDir = await derive();

    await writeSourceFile(path.join("background", "background.js"), "// edited\n");

    await derive();

    expect(await readFile(path.join(derivedDir, "background", "background.js"), "utf8")).toBe(
      "// edited\n",
    );
  });

  test("copies again when the source gained a file", async () => {
    const derivedDir = await derive();

    await writeSourceFile("content.js", "// content\n");

    await derive();

    expect(await readFile(path.join(derivedDir, "content.js"), "utf8")).toBe("// content\n");
  });

  test("gives every derived copy of the facade a bridge token of its own", async () => {
    const { bridgeToken, derivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
    });

    expect(await readFile(path.join(derivedDir, "chrome-facade.js"), "utf8")).toContain(
      JSON.stringify(bridgeToken),
    );

    const rederived = await deriveExtension({ sourceDir, derivedExtensionsDir, facadeScriptPath });

    expect(rederived.bridgeToken).not.toBe(bridgeToken);
  });

  test("reports the id the extension will be loaded as", async () => {
    const { extensionId } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
    });

    expect(extensionId).toBe("gkodpobagfoadfbnehppbpmagfgmimpa");
  });

  test("derives the copy again when the keys it strips change", async () => {
    await writeManifest({ ...manifest, content_scripts: [{ js: ["content.js"] }] });

    const derivedDir = await derive();

    expect(
      JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")),
    ).toHaveProperty("content_scripts");

    await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      strippedManifestKeys: ["content_scripts"],
    });

    expect(
      JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")),
    ).not.toHaveProperty("content_scripts");
  });

  test("reports no id for an extension without a key", async () => {
    await writeManifest({ ...manifest, key: undefined });

    const { extensionId } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
    });

    expect(extensionId).toBeUndefined();
  });

  test("injects the facade into a page only once", async () => {
    const derivedDir = await derive();

    await derive();

    const page = await readFile(path.join(derivedDir, "popup.html"), "utf8");

    expect(page.split('<script src="/chrome-facade.js"></script>')).toHaveLength(2);
  });
});

describe("pruneDerivedExtensions", () => {
  async function deriveOtherExtension() {
    const otherSourceDir = path.join(workDir, "other-source");

    await mkdir(otherSourceDir, { recursive: true });

    await writeFile(path.join(otherSourceDir, "manifest.json"), JSON.stringify(manifest));

    const { derivedDir } = await deriveExtension({
      sourceDir: otherSourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
    });

    return { otherSourceDir, otherDerivedDir: derivedDir };
  }

  test("keeps the copies of the sources it was handed and drops the rest", async () => {
    const derivedDir = await derive();

    const { otherSourceDir, otherDerivedDir } = await deriveOtherExtension();

    await pruneDerivedExtensions({ derivedExtensionsDir, keptSourceDirs: [otherSourceDir] });

    expect((await readdir(derivedExtensionsDir)).sort()).toEqual([
      path.basename(otherDerivedDir),
      `${path.basename(otherDerivedDir)}.json`,
    ]);

    expect(await readFile(path.join(otherDerivedDir, "manifest.json"), "utf8")).toContain(
      "chrome-facade-service-worker.js",
    );

    await deriveExtension({ sourceDir, derivedExtensionsDir, facadeScriptPath });

    expect(await readdir(derivedDir)).toContain("manifest.json");
  });

  test("drops a copy no stamp accounts for", async () => {
    const derivedDir = await derive();

    await rm(`${derivedDir}.json`);

    await pruneDerivedExtensions({ derivedExtensionsDir, keptSourceDirs: [sourceDir] });

    expect(await readdir(derivedExtensionsDir)).toEqual([]);
  });

  test("does nothing when nothing was derived yet", async () => {
    await pruneDerivedExtensions({
      derivedExtensionsDir: path.join(workDir, "missing"),
      keptSourceDirs: [],
    });
  });
});
