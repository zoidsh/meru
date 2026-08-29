import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExtensionIdFromManifestKey } from "../derive/extension-id";
import { FIXTURE_EXTENSION_ID } from "./id";

/**
 * The invariants that make the fixture extension safe to ship inside the app
 * bundle, held against the manifest itself so an edit to one without the
 * other fails here rather than in an end-to-end run.
 */
type FixtureManifestFile = {
  key?: string;
  background?: { service_worker?: string };
  action?: { default_popup?: string };
  content_scripts?: { matches?: string[]; js?: string[] }[];
  web_accessible_resources?: { resources?: string[]; matches?: string[] }[];
};

async function readManifest(): Promise<FixtureManifestFile> {
  return JSON.parse(await readFile(path.join(import.meta.dir, "manifest.json"), "utf8"));
}

/** The only pages the fixture may touch: a test's own loopback server. */
const LOOPBACK_MATCHES = ["http://127.0.0.1/*", "http://localhost/*"];

describe("the fixture manifest", () => {
  test("derives the pinned extension id from its key", async () => {
    const { key } = await readManifest();

    expect(getExtensionIdFromManifestKey(key)).toBe(FIXTURE_EXTENSION_ID);
  });

  test("aims its content scripts at loopback pages and nowhere else", async () => {
    const { content_scripts } = await readManifest();

    expect(content_scripts?.map((contentScript) => contentScript.matches)).toEqual([
      LOOPBACK_MATCHES,
    ]);
  });

  test("exposes its frame page to loopback pages and nowhere else", async () => {
    const { web_accessible_resources } = await readManifest();

    expect(web_accessible_resources?.map((resource) => resource.matches)).toEqual([
      LOOPBACK_MATCHES,
    ]);
  });

  test("carries the surface the runtime proxy tests drive", async () => {
    const manifest = await readManifest();

    expect(manifest.background?.service_worker).toBe("background.js");

    expect(manifest.action?.default_popup).toBe("popup.html");

    expect(manifest.web_accessible_resources?.map((resource) => resource.resources)).toEqual([
      ["fixture-frame.html"],
    ]);
  });
});
