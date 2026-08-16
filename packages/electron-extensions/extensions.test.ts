import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs, { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import path from "node:path";
import type { ClearStorageDataOptions, Extension, Session } from "electron";
import { Extensions } from "./extensions";
import {
  NATIVE_MESSAGING_ORIGIN,
  NATIVE_MESSAGING_PATHS,
} from "./native-messaging/bridge-protocol";

let workDir: string;

let facadeScriptPath: string;

beforeEach(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "electron-extensions-"));

  facadeScriptPath = path.join(workDir, "facade.js");

  await writeFile(facadeScriptPath, "// facade\n");
});

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true });
});

async function createExtensionDir(name: string, key?: string) {
  const extensionDir = path.join(workDir, name);

  await mkdir(extensionDir, { recursive: true });

  await writeFile(
    path.join(extensionDir, "manifest.json"),
    JSON.stringify({
      name,
      version: "1.0.0",
      manifest_version: 3,
      ...(key && { key }),
      background: { service_worker: "background.js", type: "module" },
    }),
  );

  await writeFile(path.join(extensionDir, "background.js"), "// background\n");

  return extensionDir;
}

function createExtensions(
  extensionDirs: string[],
  logger?: ConstructorParameters<typeof Extensions>[0]["logger"],
) {
  return new Extensions({
    extensionDirs,
    facadeScriptPath,
    derivedExtensionsDir: path.join(workDir, "derived"),
    logger,
  });
}

function createExtension(id: string, extensionDir: string, manifest: Record<string, unknown> = {}) {
  return {
    id,
    name: `Extension ${id}`,
    version: "1.0.0",
    path: extensionDir,
    url: `chrome-extension://${id}/`,
    manifest,
  } as Extension;
}

const ACTION_MANIFEST = {
  action: { default_title: "Vault", default_popup: "popup/index.html" },
  icons: { "48": "icon-48.png" },
};

async function createActionExtension(id: string, extensionDir: string) {
  await writeFile(path.join(extensionDir, "icon-48.png"), "icon");

  return createExtension(id, extensionDir, ACTION_MANIFEST);
}

function createSession({
  loadExtension = async (extensionDir: string) => createExtension("aaa", extensionDir),
  storagePath = null,
}: {
  loadExtension?: (extensionDir: string) => Promise<Extension>;
  storagePath?: string | null;
} = {}) {
  const removedExtensionIds: string[] = [];

  const handledSchemes: string[] = [];

  const sessionEvents: string[] = [];

  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

  const session = {
    extensions: {
      loadExtension: async (extensionDir: string) => {
        sessionEvents.push("loadExtension");

        return loadExtension(extensionDir);
      },
      removeExtension: (extensionId: string) => {
        removedExtensionIds.push(extensionId);
      },
    },
    protocol: {
      handle: (scheme: string, handler: (request: GlobalRequest) => Promise<Response>) => {
        handledSchemes.push(scheme);

        requestHandler = handler;
      },
      unhandle: (scheme: string) => {
        handledSchemes.splice(handledSchemes.indexOf(scheme), 1);
      },
    },
    clearStorageData: async ({ origin, storages }: ClearStorageDataOptions) => {
      sessionEvents.push(`clearStorageData ${origin} ${storages?.join()}`);
    },
    getStoragePath: () => storagePath,
  } as unknown as Session;

  return {
    session,
    removedExtensionIds,
    handledSchemes,
    sessionEvents,
    request: (body: Record<string, unknown>) =>
      requestHandler?.({
        url: `${NATIVE_MESSAGING_ORIGIN}${NATIVE_MESSAGING_PATHS.connect}`,
        headers: new Headers(),
        json: async () => body,
      } as unknown as GlobalRequest) as Promise<Response>,
  };
}

/** The token the derived copy of the facade carries into the extension. */
async function readBridgeToken(derivedDir: string) {
  const facade = await readFile(path.join(derivedDir, "chrome-facade.js"), "utf8");

  return facade.match(/"(.+)"/)?.[1];
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
  test("loads a copy of every directory, with the facade in it", async () => {
    const loadedExtensionDirs: string[] = [];

    const { session } = createSession({
      loadExtension: async (extensionDir) => {
        loadedExtensionDirs.push(extensionDir);

        return createExtension(`id-${loadedExtensionDirs.length}`, extensionDir);
      },
    });

    const extensionDirs = [await createExtensionDir("one"), await createExtensionDir("two")];

    await createExtensions(extensionDirs).setupSession(session);

    expect(loadedExtensionDirs).toHaveLength(2);
    expect(loadedExtensionDirs).not.toContain(extensionDirs[0]);

    for (const loadedExtensionDir of loadedExtensionDirs) {
      expect(await readFile(path.join(loadedExtensionDir, "chrome-facade.js"), "utf8")).toEndWith(
        "// facade\n",
      );
    }
  });

  test("loads the same copy into every session", async () => {
    const loadedExtensionDirs: string[] = [];

    const loadExtension = async (extensionDir: string) => {
      loadedExtensionDirs.push(extensionDir);

      return createExtension("aaa", extensionDir);
    };

    const extensions = createExtensions([await createExtensionDir("one")]);

    await extensions.setupSession(createSession({ loadExtension }).session);
    await extensions.setupSession(createSession({ loadExtension }).session);

    expect(loadedExtensionDirs[0]).toBe(loadedExtensionDirs[1] as string);
  });

  test("drops the cached service worker before loading an extension", async () => {
    const { session, sessionEvents } = createSession();

    // Chromium serves the worker it cached on first registration forever, so a
    // copy of the facade older than this launch would run without it
    await createExtensions([await createExtensionDir("one", "dGVzdC1rZXk=")]).setupSession(session);

    expect(sessionEvents).toEqual([
      "clearStorageData chrome-extension://gckpihaehgepkpiokicpmgbmojmemdja serviceworkers",
      "loadExtension",
    ]);
  });

  test("keeps the service worker of an extension it has no id for", async () => {
    const { session, sessionEvents } = createSession();

    await createExtensions([await createExtensionDir("one")]).setupSession(session);

    expect(sessionEvents).toEqual(["loadExtension"]);
  });

  test("answers the bridge in every session sharing a derived copy", async () => {
    const derivedDirs: string[] = [];

    const loadExtension = async (extensionDir: string) => {
      derivedDirs.push(extensionDir);

      return createExtension("aaa", extensionDir);
    };

    const first = createSession({ loadExtension });
    const second = createSession({ loadExtension });

    const extensions = createExtensions([await createExtensionDir("one")]);

    await extensions.setupSession(first.session);
    await extensions.setupSession(second.session);

    const bridgeToken = await readBridgeToken(derivedDirs[0] as string);

    const connect = (
      request: ReturnType<typeof createSession>["request"],
      token: string | undefined,
      portId: string,
    ) => request({ token, portId, hostName: "com.meru.test" });

    expect((await connect(first.request, bridgeToken, "first")).status).not.toBe(403);
    expect((await connect(second.request, bridgeToken, "second")).status).not.toBe(403);
    expect((await connect(first.request, "not-a-token", "third")).status).toBe(403);
  });

  test("does nothing without extension directories", async () => {
    let loadExtensionCalls = 0;

    const { session } = createSession({
      loadExtension: async (extensionDir) => {
        loadExtensionCalls += 1;

        return createExtension("aaa", extensionDir);
      },
    });

    const extensions = createExtensions([]);

    await extensions.setupSession(session);

    extensions.teardownSession(session);

    expect(loadExtensionCalls).toBe(0);
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa/popup.html")).toBe(
      false,
    );
  });

  test("keeps loading after a directory fails", async () => {
    const loggedErrors: Record<string, unknown>[] = [];

    const brokenExtensionDir = path.join(workDir, "broken");

    await mkdir(brokenExtensionDir);

    const { session } = createSession();

    const extensions = createExtensions([brokenExtensionDir, await createExtensionDir("one")], {
      info: () => {},
      error: (_message, details) => {
        loggedErrors.push(details);
      },
    });

    await extensions.setupSession(session);

    expect(loggedErrors).toHaveLength(1);
    expect(loggedErrors[0]?.extensionDir).toBe(brokenExtensionDir);
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa/popup.html")).toBe(
      true,
    );
  });

  test("matches URLs of extensions loaded into that session only", async () => {
    const { session: sessionWithExtension } = createSession();
    const { session: sessionWithoutExtension } = createSession();

    const extensions = createExtensions([await createExtensionDir("one")]);

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

    const extensions = createExtensions([await createExtensionDir("one")]);

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

    const extensions = createExtensions([await createExtensionDir("one")]);

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

    const extensions = createExtensions([await createExtensionDir("one")], {
      info: () => {},
      error: (_message, details) => {
        loggedErrors.push(details);
      },
    });

    await extensions.setupSession(session);

    await extensions.clearSessionData(session);

    expect(loggedErrors).toEqual([]);
  });

  test("clears a partition that holds no extension storage", async () => {
    const partitionPath = await createPartitionDir(["Cookies"]);

    const { session } = createSession({ storagePath: partitionPath });

    const extensions = createExtensions([]);

    await extensions.clearSessionData(session);

    expect(await listPartitionDir(partitionPath)).toEqual(["Cookies"]);

    await fs.rm(partitionPath, { recursive: true, force: true });
  });

  test("assembles an action for every extension it loaded", async () => {
    const { session } = createSession({
      loadExtension: (extensionDir) => createActionExtension("aaa", extensionDir),
    });

    const extensions = createExtensions([await createExtensionDir("one")]);

    await extensions.setupSession(session);

    expect(extensions.getSessionActions(session)).toEqual([
      {
        extensionId: "aaa",
        name: "Extension aaa",
        title: "Vault",
        popupUrl: "chrome-extension://aaa/popup/index.html",
        iconDataUrl: `data:image/png;base64,${Buffer.from("icon").toString("base64")}`,
      },
    ]);
  });

  test("keeps the button of an extension whose icon cannot be read", async () => {
    const loggedErrors: Record<string, unknown>[] = [];

    const { session } = createSession({
      loadExtension: async (extensionDir) =>
        createExtension("aaa", extensionDir, { icons: { "48": "missing.png" } }),
    });

    const extensions = createExtensions([await createExtensionDir("one")], {
      info: () => {},
      error: (_message, details) => {
        loggedErrors.push(details);
      },
    });

    await extensions.setupSession(session);

    expect(loggedErrors).toHaveLength(1);
    expect(extensions.getSessionActions(session)).toHaveLength(1);
    expect(extensions.getSessionActions(session)[0]?.iconDataUrl).toBe(null);
  });

  test("has no actions for a session it loaded nothing into", async () => {
    const { session } = createSession();

    const extensions = createExtensions([]);

    await extensions.setupSession(session);

    expect(extensions.getSessionActions(session)).toEqual([]);
  });

  test("reports the actions of a session whenever they change", async () => {
    const changes: { sessionActions: number }[] = [];

    const { session } = createSession({
      loadExtension: (extensionDir) => createActionExtension("aaa", extensionDir),
    });

    const extensions = createExtensions([await createExtensionDir("one")]);

    const unsubscribe = extensions.onActionsChanged((changedSession, actions) => {
      expect(changedSession).toBe(session);

      changes.push({ sessionActions: actions.length });
    });

    await extensions.setupSession(session);

    extensions.teardownSession(session);

    unsubscribe();

    await extensions.setupSession(session);

    expect(changes).toEqual([{ sessionActions: 1 }, { sessionActions: 0 }]);
  });

  test("unloads an extension that finished loading after teardown", async () => {
    const { promise: loadExtensionPromise, resolve: resolveLoadExtension } =
      Promise.withResolvers<Extension>();

    const { session, removedExtensionIds } = createSession({
      loadExtension: () => loadExtensionPromise,
    });

    const extensions = createExtensions([
      await createExtensionDir("one"),
      await createExtensionDir("two"),
    ]);

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
