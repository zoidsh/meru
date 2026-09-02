import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { RUNTIME_PROXY_MANIFEST_GLOBAL } from "../runtime-proxy/bridge-protocol";
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

  test("copies again when the copy is gone and its stamp still matches", async () => {
    const derivedDir = await derive();

    await rm(derivedDir, { recursive: true, force: true });

    await derive();

    expect(await readFile(path.join(derivedDir, "background", "background.js"), "utf8")).toBe(
      "// background\n",
    );
    expect(await readFile(path.join(derivedDir, "chrome-facade.js"), "utf8")).toEndWith(
      "// facade\n",
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

  // Nothing in the source changes between the two derives, so the copy is
  // written again only because the matches did
  test("clamps the content scripts of the copy and derives again when the matches change", async () => {
    await writeManifest({
      ...manifest,
      content_scripts: [{ matches: ["<all_urls>"], js: ["content.js"], all_frames: true }],
    });

    const derivedDir = await derive();

    expect(
      JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")).content_scripts,
    ).toEqual([{ matches: ["<all_urls>"], js: ["content.js"], all_frames: true }]);

    await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      getContentScriptMatches: () => ["https://accounts.google.com/*"],
    });

    expect(
      JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")).content_scripts,
    ).toEqual([
      { matches: ["https://accounts.google.com/*"], js: ["content.js"], all_frames: true },
    ]);
  });

  test("asks for the matches by the id the extension will be loaded as", async () => {
    const askedExtensionIds: string[] = [];

    await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      getContentScriptMatches: (extensionId) => {
        askedExtensionIds.push(extensionId);

        return undefined;
      },
    });

    expect(askedExtensionIds).toEqual(["gkodpobagfoadfbnehppbpmagfgmimpa"]);
  });

  test("clamps nothing for an extension without a key", async () => {
    const contentScripts = [{ matches: ["<all_urls>"], js: ["content.js"] }];

    await writeManifest({ ...manifest, key: undefined, content_scripts: contentScripts });

    let asked = false;

    const { derivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      getContentScriptMatches: () => {
        asked = true;

        return ["https://accounts.google.com/*"];
      },
    });

    expect(asked).toBe(false);
    expect(
      JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")).content_scripts,
    ).toEqual(contentScripts);
  });

  test("digests the source tree the way a stamp already on disk was written", async () => {
    const derivedDir = await derive();

    const fileNames = ["background/background.js", "manifest.json", "popup.html"];

    const fileEntries = await Promise.all(
      fileNames.map(async (fileName) => {
        const stats = await stat(path.join(sourceDir, ...fileName.split("/")));

        return `${fileName}\0${stats.size}\0${stats.mtimeMs}`;
      }),
    );

    expect(JSON.parse(await readFile(`${derivedDir}.json`, "utf8")).sourceTree).toBe(
      createHash("sha256").update(fileEntries.sort().join("\n")).digest("hex"),
    );
  });

  test("stamps a copy without matches as it did before they existed", async () => {
    const derivedDir = await derive();

    expect(JSON.parse(await readFile(`${derivedDir}.json`, "utf8"))).not.toHaveProperty(
      "contentScriptMatches",
    );
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

describe("deriveExtension for a shared instance", () => {
  let shimScriptPath: string;

  let relayScriptPath: string;

  beforeEach(async () => {
    shimScriptPath = path.join(workDir, "shim.js");

    relayScriptPath = path.join(workDir, "relay.js");

    await writeFile(shimScriptPath, "// shim\n");

    await writeFile(relayScriptPath, "// relay\n");

    await writeManifest({
      ...manifest,
      content_scripts: [{ matches: ["https://*/*"], js: ["content.js"] }],
    });

    await writeSourceFile("content.js", "// content\n");

    await writeSourceFile(
      "popup.html",
      `<html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'"><script src="/popup.js"></script></head></html>`,
    );
  });

  test("the worker copy carries the relay client under the facade's token", async () => {
    const { derivedDir, bridgeToken } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "worker", relayScriptPath },
    });

    const relaySource = await readFile(
      path.join(derivedDir, "chrome-runtime-proxy-relay.js"),
      "utf8",
    );

    expect(relaySource).toContain(bridgeToken);
    expect(relaySource).toEndWith("// relay\n");

    expect(
      await readFile(path.join(derivedDir, "chrome-facade-service-worker.js"), "utf8"),
    ).toContain('import "./chrome-runtime-proxy-relay.js";');
  });

  test("the content-script-only copy loses the worker and gains the shim", async () => {
    const { derivedDir, bridgeToken } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "contentScriptOnly", shimScriptPath },
    });

    const derivedManifest = JSON.parse(
      await readFile(path.join(derivedDir, "manifest.json"), "utf8"),
    );

    expect("background" in derivedManifest).toBe(false);
    expect(derivedManifest.content_scripts).toEqual([
      { matches: ["https://*/*"], js: ["chrome-runtime-proxy-shim.js", "content.js"] },
    ]);

    const shimSource = await readFile(
      path.join(derivedDir, "chrome-runtime-proxy-shim.js"),
      "utf8",
    );

    expect(shimSource).toContain(bridgeToken);
    expect(shimSource).toEndWith("// shim\n");
  });

  /**
   * The manifest the derive left on the shim's globals, read back the way the
   * shim itself reads it: the preamble is one assignment per line, ahead of the
   * bundle.
   */
  async function readShimManifest(derivedDir: string) {
    const shimSource = await readFile(
      path.join(derivedDir, "chrome-runtime-proxy-shim.js"),
      "utf8",
    );

    const assignment = shimSource
      .split("\n")
      .find((line) => line.startsWith(`globalThis.${RUNTIME_PROXY_MANIFEST_GLOBAL} = `));

    if (!assignment) {
      throw new Error("The shim carries no manifest");
    }

    return JSON.parse(
      assignment.slice(`globalThis.${RUNTIME_PROXY_MANIFEST_GLOBAL} = `.length, -1),
    );
  }

  test("the content-script-only copy's shim carries the worker copy's own manifest", async () => {
    const { derivedDir: workerDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "worker", relayScriptPath },
    });

    const { derivedDir: shimDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "contentScriptOnly", shimScriptPath },
    });

    const workerManifest = JSON.parse(
      await readFile(path.join(workerDir, "manifest.json"), "utf8"),
    );

    // Byte for byte what the one worker's own `getManifest` answers, which is
    // the whole point: the shim's `background` key and its unshimmed
    // `content_scripts` are the worker copy's, not this copy's
    expect(await readShimManifest(shimDir)).toEqual(workerManifest);

    expect(workerManifest.background).toEqual({
      service_worker: "chrome-facade-service-worker.js",
      type: "module",
    });
  });

  test("the two roles' manifests differ in the keys the shim lays over, and no others", async () => {
    const { derivedDir: workerDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "worker", relayScriptPath },
    });

    const { derivedDir: shimDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "contentScriptOnly", shimScriptPath },
    });

    const readManifest = async (derivedDir: string) =>
      JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")) as Record<
        string,
        unknown
      >;

    const workerManifest = await readManifest(workerDir);

    const shimManifest = await readManifest(shimDir);

    const differingKeys = [
      ...new Set([...Object.keys(workerManifest), ...Object.keys(shimManifest)]),
    ]
      .filter(
        (manifestKey) =>
          JSON.stringify(workerManifest[manifestKey]) !== JSON.stringify(shimManifest[manifestKey]),
      )
      .sort();

    // The shim answers the worker role's manifest by laying exactly these two
    // keys over its own context's native answer, so a third difference would
    // stop being answered without anything else failing
    expect(differingKeys).toEqual(["background", "content_scripts"]);
  });

  test("the shim's manifest is derived without a worker copy on disk", async () => {
    const { derivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "contentScriptOnly", shimScriptPath },
    });

    // The session that adopts the worker role derives its copy when it is set
    // up, which can be after this one and need not happen at all
    expect((await readdir(derivedExtensionsDir)).sort()).toEqual(
      [path.basename(derivedDir), `${path.basename(derivedDir)}.json`].sort(),
    );

    expect(await readShimManifest(derivedDir)).toMatchObject({
      background: { service_worker: "chrome-facade-service-worker.js" },
      content_scripts: [{ matches: ["https://*/*"], js: ["content.js"] }],
    });
  });

  test("the shim's manifest follows a changed clamp", async () => {
    const deriveClampedTo = async (matches: string[]) =>
      (
        await deriveExtension({
          sourceDir,
          derivedExtensionsDir,
          facadeScriptPath,
          getContentScriptMatches: () => matches,
          sharedInstance: { role: "contentScriptOnly", shimScriptPath },
        })
      ).derivedDir;

    const derivedDir = await deriveClampedTo(["https://mail.google.com/*"]);

    expect((await readShimManifest(derivedDir)).content_scripts).toEqual([
      { matches: ["https://mail.google.com/*"], js: ["content.js"] },
    ]);

    expect(
      (await readShimManifest(await deriveClampedTo(["https://accounts.google.com/*"])))
        .content_scripts,
    ).toEqual([{ matches: ["https://accounts.google.com/*"], js: ["content.js"] }]);
  });

  test("the content-script-only copy's pages run the shim and may reach the bridge", async () => {
    const { derivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "contentScriptOnly", shimScriptPath },
    });

    const page = await readFile(path.join(derivedDir, "popup.html"), "utf8");

    // The popup is where a password manager keeps its unlock UI, and this copy
    // has no worker of its own for it to talk to
    expect(page.indexOf("/chrome-facade.js")).toBeLessThan(
      page.indexOf("/chrome-runtime-proxy-shim.js"),
    );
    expect(page.indexOf("/chrome-runtime-proxy-shim.js")).toBeLessThan(page.indexOf("/popup.js"));

    expect(page).toContain(
      `content="default-src 'none'; script-src 'self'; connect-src extension-bridge:"`,
    );
  });

  test("the worker copy's pages skip the shim but still reach the bridge", async () => {
    const { derivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "worker", relayScriptPath },
    });

    const page = await readFile(path.join(derivedDir, "popup.html"), "utf8");

    expect(page).not.toContain("chrome-runtime-proxy-shim.js");

    // The facade calls the bridge from pages whatever the copy's role —
    // `connectNative` above all — and the page's own policy would refuse it
    expect(page).toContain(
      `content="default-src 'none'; script-src 'self'; connect-src extension-bridge:"`,
    );
  });

  test("the ordinary copy's pages reach the bridge too, shared instance or none", async () => {
    const { derivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
    });

    const page = await readFile(path.join(derivedDir, "popup.html"), "utf8");

    expect(page).not.toContain("chrome-runtime-proxy-shim.js");
    expect(page).toContain(
      `content="default-src 'none'; script-src 'self'; connect-src extension-bridge:"`,
    );
  });

  test("the two copies exist side by side, from one source, as one extension id", async () => {
    const workerCopy = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "worker", relayScriptPath },
    });

    const contentScriptCopy = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "contentScriptOnly", shimScriptPath },
    });

    expect(contentScriptCopy.derivedDir).not.toBe(workerCopy.derivedDir);
    expect(contentScriptCopy.extensionId).toBe(workerCopy.extensionId);

    expect(
      JSON.parse(await readFile(path.join(workerCopy.derivedDir, "manifest.json"), "utf8"))
        .background,
    ).toBeDefined();
  });

  test("a role toggle re-derives the copy in place", async () => {
    const { derivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "worker", relayScriptPath },
    });

    const { derivedDir: plainDerivedDir } = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
    });

    expect(plainDerivedDir).toBe(derivedDir);

    expect(
      await readFile(path.join(plainDerivedDir, "chrome-facade-service-worker.js"), "utf8"),
    ).not.toContain("chrome-runtime-proxy-relay.js");
  });

  test("pruning spares both copies of a kept source", async () => {
    const workerCopy = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "worker", relayScriptPath },
    });

    const contentScriptCopy = await deriveExtension({
      sourceDir,
      derivedExtensionsDir,
      facadeScriptPath,
      sharedInstance: { role: "contentScriptOnly", shimScriptPath },
    });

    await pruneDerivedExtensions({ derivedExtensionsDir, keptSourceDirs: [sourceDir] });

    expect(await readdir(workerCopy.derivedDir)).toContain("manifest.json");
    expect(await readdir(contentScriptCopy.derivedDir)).toContain("manifest.json");

    await pruneDerivedExtensions({ derivedExtensionsDir, keptSourceDirs: [] });

    expect(await readdir(derivedExtensionsDir)).toEqual([]);
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
