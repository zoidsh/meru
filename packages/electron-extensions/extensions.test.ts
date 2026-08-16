import { describe, expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Extension, Session } from "electron";
import { Extensions } from "./extensions";

function createExtension(id: string, extensionDir: string) {
  return {
    id,
    name: `Extension ${id}`,
    version: "1.0.0",
    path: extensionDir,
    url: `chrome-extension://${id}/`,
    manifest: {},
  } as Extension;
}

function createSession({
  loadExtension = async (extensionDir: string) => createExtension("aaa", extensionDir),
  storagePath = null,
}: {
  loadExtension?: (extensionDir: string) => Promise<Extension>;
  storagePath?: string | null;
} = {}) {
  const removedExtensionIds: string[] = [];

  const session = {
    extensions: {
      loadExtension,
      removeExtension: (extensionId: string) => {
        removedExtensionIds.push(extensionId);
      },
    },
    getStoragePath: () => storagePath,
  } as unknown as Session;

  return { session, removedExtensionIds };
}

async function createPartitionDir(entryPaths: string[]) {
  const partitionPath = await fs.mkdtemp(path.join(os.tmpdir(), "electron-extensions-"));

  for (const entryPath of entryPaths) {
    const filePath = path.join(partitionPath, entryPath);

    await fs.mkdir(path.dirname(filePath), { recursive: true });

    await fs.writeFile(filePath, "");
  }

  return partitionPath;
}

async function listPartitionDir(partitionPath: string) {
  const entryPaths = await fs.readdir(partitionPath, { recursive: true });

  return entryPaths.sort();
}

describe("Extensions", () => {
  test("loads every directory into the session", async () => {
    const loadedExtensionDirs: string[] = [];

    const { session } = createSession({
      loadExtension: async (extensionDir) => {
        loadedExtensionDirs.push(extensionDir);

        return createExtension(`id-${loadedExtensionDirs.length}`, extensionDir);
      },
    });

    const extensions = new Extensions({ extensionDirs: ["/extensions/one", "/extensions/two"] });

    await extensions.setupSession(session);

    expect(loadedExtensionDirs).toEqual(["/extensions/one", "/extensions/two"]);
  });

  test("does nothing without extension directories", async () => {
    let loadExtensionCalls = 0;

    const { session } = createSession({
      loadExtension: async (extensionDir) => {
        loadExtensionCalls += 1;

        return createExtension("aaa", extensionDir);
      },
    });

    const extensions = new Extensions({ extensionDirs: [] });

    await extensions.setupSession(session);

    extensions.teardownSession(session);

    expect(loadExtensionCalls).toBe(0);
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa/popup.html")).toBe(
      false,
    );
  });

  test("keeps loading after a directory fails", async () => {
    const loggedErrors: Record<string, unknown>[] = [];

    const { session } = createSession({
      loadExtension: async (extensionDir) => {
        if (extensionDir === "/extensions/broken") {
          throw new Error("Could not load extension");
        }

        return createExtension("aaa", extensionDir);
      },
    });

    const extensions = new Extensions({
      extensionDirs: ["/extensions/broken", "/extensions/one"],
      logger: {
        info: () => {},
        error: (_message, details) => {
          loggedErrors.push(details);
        },
      },
    });

    await extensions.setupSession(session);

    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]?.extensionDir).toBe("/extensions/broken");
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa/popup.html")).toBe(
      true,
    );
  });

  test("matches URLs of extensions loaded into that session only", async () => {
    const { session: sessionWithExtension } = createSession();
    const { session: sessionWithoutExtension } = createSession();

    const extensions = new Extensions({ extensionDirs: ["/extensions/one"] });

    await extensions.setupSession(sessionWithExtension);

    expect(
      extensions.isLoadedExtensionUrl(sessionWithExtension, "chrome-extension://aaa/popup.html"),
    ).toBe(true);
    expect(
      extensions.isLoadedExtensionUrl(sessionWithExtension, "chrome-extension://bbb/popup.html"),
    ).toBe(false);
    expect(
      extensions.isLoadedExtensionUrl(sessionWithExtension, "https://mail.google.com/mail/u/0"),
    ).toBe(false);
    expect(
      extensions.isLoadedExtensionUrl(sessionWithoutExtension, "chrome-extension://aaa/popup.html"),
    ).toBe(false);
  });

  test("unloads what it loaded and forgets the session", async () => {
    const { session, removedExtensionIds } = createSession();

    const extensions = new Extensions({ extensionDirs: ["/extensions/one"] });

    await extensions.setupSession(session);

    extensions.teardownSession(session);

    expect(removedExtensionIds).toEqual(["aaa"]);
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa/popup.html")).toBe(
      false,
    );

    extensions.teardownSession(session);

    expect(removedExtensionIds).toEqual(["aaa"]);
  });

  test("clears extension storage and leaves the rest of the partition alone", async () => {
    const partitionPath = await createPartitionDir([
      "Local Extension Settings/aaa/000003.log",
      "Sync Extension Settings/aaa/000003.log",
      "Managed Extension Settings/aaa/000003.log",
      "Extension Rules/000003.log",
      "Extension Scripts/000003.log",
      "Extension State/000003.log",
      "IndexedDB/chrome-extension_aaa_0.indexeddb.leveldb/000003.log",
      "IndexedDB/https_mail.google.com_0.indexeddb.leveldb/000003.log",
      "Local Storage/leveldb/000003.log",
      "Cookies",
    ]);

    const { session } = createSession({ storagePath: partitionPath });

    const extensions = new Extensions({ extensionDirs: ["/extensions/one"] });

    await extensions.setupSession(session);

    extensions.teardownSession(session);

    await extensions.clearSessionData(session);

    expect(await listPartitionDir(partitionPath)).toEqual([
      "Cookies",
      "IndexedDB",
      path.join("IndexedDB", "https_mail.google.com_0.indexeddb.leveldb"),
      path.join("IndexedDB", "https_mail.google.com_0.indexeddb.leveldb", "000003.log"),
      "Local Storage",
      path.join("Local Storage", "leveldb"),
      path.join("Local Storage", "leveldb", "000003.log"),
    ]);

    await fs.rm(partitionPath, { recursive: true, force: true });
  });

  test("clears nothing for a session without a storage path", async () => {
    const loggedErrors: Record<string, unknown>[] = [];

    const { session } = createSession();

    const extensions = new Extensions({
      extensionDirs: ["/extensions/one"],
      logger: {
        info: () => {},
        error: (_message, details) => {
          loggedErrors.push(details);
        },
      },
    });

    await extensions.setupSession(session);

    await extensions.clearSessionData(session);

    expect(loggedErrors).toEqual([]);
  });

  test("clears a partition that holds no extension storage", async () => {
    const partitionPath = await createPartitionDir(["Cookies"]);

    const { session } = createSession({ storagePath: partitionPath });

    const extensions = new Extensions({ extensionDirs: [] });

    await extensions.clearSessionData(session);

    expect(await listPartitionDir(partitionPath)).toEqual(["Cookies"]);

    await fs.rm(partitionPath, { recursive: true, force: true });
  });

  test("unloads an extension that finished loading after teardown", async () => {
    const { promise: loadExtensionPromise, resolve: resolveLoadExtension } =
      Promise.withResolvers<Extension>();

    const { session, removedExtensionIds } = createSession({
      loadExtension: () => loadExtensionPromise,
    });

    const extensions = new Extensions({ extensionDirs: ["/extensions/one", "/extensions/two"] });

    const setupSessionPromise = extensions.setupSession(session);

    extensions.teardownSession(session);

    resolveLoadExtension(createExtension("aaa", "/extensions/one"));

    await setupSessionPromise;

    expect(removedExtensionIds).toEqual(["aaa"]);
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa/popup.html")).toBe(
      false,
    );
  });
});
