import { afterAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ONEPASSWORD_EXTENSION_ID } from "@meru/shared/extensions";

// Bitwarden's id, which a Beta catalog offers and this one doesn't
const UNCATALOGUED_EXTENSION_ID = "nngceckbapebfimnlniiiahkandclblb";

// The worker session is the default session, whose storage path is `userData`
// itself, so one directory stands in for both
const userDataPath = await mkdtemp(path.join(tmpdir(), "meru-extensions-"));

const grantedPermissionsPath = path.join(userDataPath, "extension-permissions.json");

let configValues: Record<string, unknown> = {};

const infoLogs: [string, unknown][] = [];

mock.module("@electron-toolkit/utils", () => ({ is: { dev: false } }));

mock.module("electron", () => ({
  app: { getPath: () => userDataPath, getAppPath: () => userDataPath },
  protocol: { registerSchemesAsPrivileged: () => {} },
  session: { defaultSession: { getStoragePath: () => userDataPath } },
}));

mock.module("@/config", () => ({
  config: {
    get: (key: string) => configValues[key],
    set: (key: string, value: unknown) => {
      configValues[key] = value;
    },
  },
}));

mock.module("@/lib/log", () => ({
  log: {
    debug: () => {},
    info: (message: string, details: unknown) => {
      infoLogs.push([message, details]);
    },
    error: () => {},
  },
}));

mock.module("@/accounts", () => ({ accounts: {} }));

mock.module("@/license-key", () => ({ licenseKey: { isValid: true } }));

mock.module("@/workspace-app", () => ({ WorkspaceApp: {} }));

const { removeUncataloguedExtensions } = await import("./extensions");

const extensionStoragePaths = (extensionId: string) => [
  path.join("extensions", extensionId, "1.0.0", "manifest.json"),
  path.join("Local Extension Settings", extensionId, "000003.log"),
  path.join("Sync Extension Settings", extensionId, "000003.log"),
  path.join("IndexedDB", `chrome-extension_${extensionId}_0.indexeddb.leveldb`, "000003.log"),
];

async function writeExtensionFiles(extensionId: string) {
  for (const relativePath of extensionStoragePaths(extensionId)) {
    const filePath = path.join(userDataPath, relativePath);

    await mkdir(path.dirname(filePath), { recursive: true });

    await writeFile(filePath, "");
  }
}

async function listExtensionFiles(extensionId: string) {
  const entries = await readdir(userDataPath, { recursive: true });

  const writtenPaths = extensionStoragePaths(extensionId);

  return entries.filter((entry) => writtenPaths.includes(entry)).sort();
}

beforeEach(async () => {
  await rm(userDataPath, { recursive: true, force: true });

  await mkdir(userDataPath);

  configValues = {
    "extensions.installed": [],
    "extensions.additionalSites": {},
  };

  infoLogs.length = 0;
});

afterAll(async () => {
  await rm(userDataPath, { recursive: true, force: true });
});

describe("removeUncataloguedExtensions", () => {
  test("removes an id the catalog doesn't offer from config, disk and the worker session", async () => {
    configValues["extensions.installed"] = [ONEPASSWORD_EXTENSION_ID, UNCATALOGUED_EXTENSION_ID];
    configValues["extensions.additionalSites"] = {
      [ONEPASSWORD_EXTENSION_ID]: ["sso.example.com"],
      [UNCATALOGUED_EXTENSION_ID]: ["sso.example.com"],
    };

    await writeExtensionFiles(ONEPASSWORD_EXTENSION_ID);
    await writeExtensionFiles(UNCATALOGUED_EXTENSION_ID);

    await writeFile(
      grantedPermissionsPath,
      JSON.stringify({
        [ONEPASSWORD_EXTENSION_ID]: ["notifications"],
        [UNCATALOGUED_EXTENSION_ID]: ["notifications"],
      }),
    );

    await removeUncataloguedExtensions();

    expect(JSON.parse(await readFile(grantedPermissionsPath, "utf8"))).toEqual({
      [ONEPASSWORD_EXTENSION_ID]: ["notifications"],
    });
    expect(configValues["extensions.installed"]).toEqual([ONEPASSWORD_EXTENSION_ID]);
    expect(configValues["extensions.additionalSites"]).toEqual({
      [ONEPASSWORD_EXTENSION_ID]: ["sso.example.com"],
    });
    expect(await listExtensionFiles(UNCATALOGUED_EXTENSION_ID)).toEqual([]);
    expect(infoLogs).toContainEqual([
      "Removed extension this version doesn't offer",
      { extensionId: UNCATALOGUED_EXTENSION_ID },
    ]);
  });

  test("leaves 1Password's package and store alone", async () => {
    configValues["extensions.installed"] = [ONEPASSWORD_EXTENSION_ID, UNCATALOGUED_EXTENSION_ID];

    await writeExtensionFiles(ONEPASSWORD_EXTENSION_ID);
    await writeExtensionFiles(UNCATALOGUED_EXTENSION_ID);

    const onePasswordFiles = await listExtensionFiles(ONEPASSWORD_EXTENSION_ID);

    await removeUncataloguedExtensions();

    expect(onePasswordFiles.length).toBeGreaterThan(0);
    expect(await listExtensionFiles(ONEPASSWORD_EXTENSION_ID)).toEqual(onePasswordFiles);
  });

  test("leaves the config untouched when every id is curated", async () => {
    const installedExtensionIds = [ONEPASSWORD_EXTENSION_ID];

    configValues["extensions.installed"] = installedExtensionIds;

    await writeExtensionFiles(ONEPASSWORD_EXTENSION_ID);

    await removeUncataloguedExtensions();

    expect(configValues["extensions.installed"]).toBe(installedExtensionIds);
    expect(await listExtensionFiles(ONEPASSWORD_EXTENSION_ID)).toHaveLength(
      extensionStoragePaths(ONEPASSWORD_EXTENSION_ID).length,
    );
    expect(infoLogs).toEqual([]);
  });

  test("drops a malformed id from the config without deleting anything by it", async () => {
    configValues["extensions.installed"] = [ONEPASSWORD_EXTENSION_ID, ".."];

    await writeExtensionFiles(ONEPASSWORD_EXTENSION_ID);

    await removeUncataloguedExtensions();

    expect(configValues["extensions.installed"]).toEqual([ONEPASSWORD_EXTENSION_ID]);
    expect(await listExtensionFiles(ONEPASSWORD_EXTENSION_ID)).toHaveLength(
      extensionStoragePaths(ONEPASSWORD_EXTENSION_ID).length,
    );
  });
});
