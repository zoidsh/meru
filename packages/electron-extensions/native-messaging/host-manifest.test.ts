import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  findHostManifest,
  getHostManifestSearchPaths,
  isExtensionAllowed,
  isValidHostName,
  parseHostManifest,
  resolveHostPath,
} from "./host-manifest";

const HOST_NAME = "com.1password.1password";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

function manifestSource(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    name: HOST_NAME,
    path: "/opt/1Password/1Password-BrowserSupport",
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
    ...overrides,
  });
}

describe("getHostManifestSearchPaths", () => {
  test("looks in the user directories before the system ones on Linux", () => {
    const searchPaths = getHostManifestSearchPaths(HOST_NAME, {
      platform: "linux",
      homeDir: "/home/tim",
    });

    expect(searchPaths[0]).toBe(
      `/home/tim/.config/google-chrome/NativeMessagingHosts/${HOST_NAME}.json`,
    );
    expect(searchPaths).toContain(
      `/home/tim/.config/chromium/NativeMessagingHosts/${HOST_NAME}.json`,
    );
    expect(searchPaths.at(-1)).toBe(`/etc/opt/edge/native-messaging-hosts/${HOST_NAME}.json`);
    expect(searchPaths.indexOf(`/etc/opt/chrome/native-messaging-hosts/${HOST_NAME}.json`)).toBe(
      searchPaths.findIndex((searchPath) => searchPath.startsWith("/etc/")),
    );
  });

  test("looks in the macOS locations on macOS", () => {
    const searchPaths = getHostManifestSearchPaths(HOST_NAME, {
      platform: "darwin",
      homeDir: "/Users/tim",
    });

    expect(searchPaths[0]).toBe(
      `/Users/tim/Library/Application Support/Google/Chrome/NativeMessagingHosts/${HOST_NAME}.json`,
    );
    expect(searchPaths).toContain(`/Library/Google/Chrome/NativeMessagingHosts/${HOST_NAME}.json`);
  });

  test("has no directories to walk on Windows, where the registry answers", () => {
    expect(getHostManifestSearchPaths(HOST_NAME, { platform: "win32" })).toEqual([]);
  });
});

describe("isValidHostName", () => {
  test("takes what Chrome documents as a host name", () => {
    expect(isValidHostName("com.1password.1password")).toBe(true);
    expect(isValidHostName("host_name")).toBe(true);
  });

  test("refuses anything that could leave the directory it is joined to", () => {
    expect(isValidHostName("../../etc/passwd")).toBe(false);
    expect(isValidHostName("com/1password")).toBe(false);
    expect(isValidHostName("com..1password")).toBe(false);
    expect(isValidHostName(".com.1password")).toBe(false);
    expect(isValidHostName("com.1password.")).toBe(false);
    expect(isValidHostName("Com.1Password")).toBe(false);
    expect(isValidHostName("")).toBe(false);
  });
});

describe("parseHostManifest", () => {
  test("reads a well-formed manifest", () => {
    expect(parseHostManifest(manifestSource(), HOST_NAME)).toEqual({
      name: HOST_NAME,
      description: undefined,
      path: "/opt/1Password/1Password-BrowserSupport",
      type: "stdio",
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
    });
  });

  test("refuses a manifest that names a different host", () => {
    expect(() => parseHostManifest(manifestSource({ name: "com.other" }), HOST_NAME)).toThrow(
      /names "com.other"/,
    );
  });

  test("refuses a transport it cannot speak", () => {
    expect(() => parseHostManifest(manifestSource({ type: "native" }), HOST_NAME)).toThrow(
      /type "native"/,
    );
  });

  test("refuses a manifest without a path or allowed_origins", () => {
    expect(() => parseHostManifest(manifestSource({ path: "" }), HOST_NAME)).toThrow(/no path/);
    expect(() =>
      parseHostManifest(manifestSource({ allowed_origins: undefined }), HOST_NAME),
    ).toThrow(/no allowed_origins/);
  });
});

describe("isExtensionAllowed", () => {
  const manifest = parseHostManifest(manifestSource(), HOST_NAME);

  test("allows an extension the host listed", () => {
    expect(isExtensionAllowed(manifest, EXTENSION_ID)).toBe(true);
  });

  test("refuses every extension the host did not list", () => {
    expect(isExtensionAllowed(manifest, "b".repeat(32))).toBe(false);
    expect(isExtensionAllowed({ ...manifest, allowed_origins: [] }, EXTENSION_ID)).toBe(false);
  });

  test("matches the whole origin, not a prefix of it", () => {
    expect(isExtensionAllowed(manifest, EXTENSION_ID.slice(0, 20))).toBe(false);
  });
});

describe("resolveHostPath", () => {
  test("resolves a relative path against the manifest's directory", () => {
    expect(
      resolveHostPath("/etc/opt/chrome/native-messaging-hosts/host.json", {
        name: HOST_NAME,
        path: "./bin/host",
        type: "stdio",
        allowed_origins: [],
      }),
    ).toBe("/etc/opt/chrome/native-messaging-hosts/bin/host");
  });
});

describe("findHostManifest", () => {
  test("takes the first readable manifest, passing over a broken one", async () => {
    const homeDir = await mkdtemp(path.join(tmpdir(), "native-messaging-"));

    const firstDir = path.join(homeDir, ".config/google-chrome/NativeMessagingHosts");

    const secondDir = path.join(homeDir, ".config/chromium/NativeMessagingHosts");

    await mkdir(firstDir, { recursive: true });

    await mkdir(secondDir, { recursive: true });

    await writeFile(path.join(firstDir, `${HOST_NAME}.json`), "{ not json");

    await writeFile(path.join(secondDir, `${HOST_NAME}.json`), manifestSource());

    const found = await findHostManifest(HOST_NAME, { platform: "linux", homeDir });

    expect(found?.manifestPath).toBe(path.join(secondDir, `${HOST_NAME}.json`));
    expect(found?.manifest.path).toBe("/opt/1Password/1Password-BrowserSupport");

    expect(await findHostManifest("com.missing", { platform: "linux", homeDir })).toBeUndefined();

    await rm(homeDir, { recursive: true, force: true });
  });

  test("never looks up a host name that is not one", async () => {
    expect(
      await findHostManifest("../../../etc/passwd", { platform: "linux", homeDir: "/home/tim" }),
    ).toBeUndefined();
  });
});
