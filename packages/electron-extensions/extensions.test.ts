import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs, { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os, { tmpdir } from "node:os";
import path from "node:path";
import type { ClearStorageDataOptions, Extension, Session } from "electron";
import { EXTENSION_BRIDGE_SCHEME, getExtensionBridgeUrl } from "./bridge/protocol";
import { Extensions } from "./extensions";
import { NATIVE_MESSAGING_PATHS } from "./native-messaging/bridge-protocol";
import { createSharedExtensionInstance } from "./runtime-proxy";

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
  extensionDirs: ConstructorParameters<typeof Extensions>[0]["extensionDirs"],
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

  const beforeSendHeadersFilters: unknown[] = [];

  let requestHandler: ((request: GlobalRequest) => Promise<Response>) | undefined;

  const serviceWorkerConsoleListeners = new Set<
    (event: unknown, messageDetails: Record<string, unknown>) => void
  >();

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
    webRequest: {
      onBeforeSendHeaders: (filterOrListener: unknown) => {
        beforeSendHeadersFilters.push(filterOrListener);
      },
    },
    serviceWorkers: {
      on: (
        _eventName: string,
        listener: (event: unknown, messageDetails: Record<string, unknown>) => void,
      ) => {
        serviceWorkerConsoleListeners.add(listener);
      },
      removeListener: (
        _eventName: string,
        listener: (event: unknown, messageDetails: Record<string, unknown>) => void,
      ) => {
        serviceWorkerConsoleListeners.delete(listener);
      },
    },
  } as unknown as Session;

  return {
    session,
    removedExtensionIds,
    handledSchemes,
    sessionEvents,
    beforeSendHeadersFilters,
    serviceWorkerConsoleListeners,
    emitServiceWorkerConsole: (messageDetails: Record<string, unknown>) => {
      for (const listener of serviceWorkerConsoleListeners) {
        listener(undefined, messageDetails);
      }
    },
    request: (bridgeToken: string, body: Record<string, unknown>) =>
      requestHandler?.(
        new Request(getExtensionBridgeUrl(NATIVE_MESSAGING_PATHS.connect, bridgeToken), {
          method: "POST",
          body: JSON.stringify(body),
        }) as GlobalRequest,
      ) as Promise<Response>,
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

  test("asks for the directories of every session it sets up", async () => {
    const loadedExtensionDirs: string[] = [];

    const loadExtension = async (extensionDir: string) => {
      loadedExtensionDirs.push(extensionDir);

      return createExtension("aaa", extensionDir);
    };

    const extensionDirs = [await createExtensionDir("one")];

    const extensions = createExtensions(async () => extensionDirs);

    await extensions.setupSession(createSession({ loadExtension }).session);

    // What an extension installed while the app is running looks like
    extensionDirs.push(await createExtensionDir("two"));

    await extensions.setupSession(createSession({ loadExtension }).session);

    expect(loadedExtensionDirs).toHaveLength(3);
    expect(new Set(loadedExtensionDirs).size).toBe(2);
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

  test("loads the first of several directories carrying one extension id", async () => {
    const loggedInfo: { message: string; details: Record<string, unknown> }[] = [];

    const { session, sessionEvents } = createSession();

    const firstExtensionDir = await createExtensionDir("one", "dGVzdC1rZXk=");

    const secondExtensionDir = await createExtensionDir("two", "dGVzdC1rZXk=");

    // Chromium loads both copies under the one id, where the second load's
    // storage clear drops the service worker the first just registered
    await createExtensions([firstExtensionDir, secondExtensionDir], {
      info: (message, details) => {
        loggedInfo.push({ message, details });
      },
      error: () => {},
    }).setupSession(session);

    expect(sessionEvents).toEqual([
      "clearStorageData chrome-extension://gckpihaehgepkpiokicpmgbmojmemdja serviceworkers",
      "loadExtension",
    ]);
    expect(loggedInfo).toEqual([
      {
        message: "Skipped duplicate extension directory",
        details: {
          id: "gckpihaehgepkpiokicpmgbmojmemdja",
          extensionDir: secondExtensionDir,
        },
      },
      {
        message: "Loaded extension",
        details: {
          id: "aaa",
          name: "Extension aaa",
          version: "1.0.0",
          extensionDir: firstExtensionDir,
        },
      },
    ]);
  });

  test("loads every directory of an extension it has no id for", async () => {
    const { session, sessionEvents } = createSession();

    // Chromium derives a keyless extension's id from the directory it loads
    // from, so two of them are two extensions rather than one twice
    await createExtensions([
      await createExtensionDir("one"),
      await createExtensionDir("two"),
    ]).setupSession(session);

    expect(sessionEvents).toEqual(["loadExtension", "loadExtension"]);
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

    const bridgeToken = (await readBridgeToken(derivedDirs[0] as string)) as string;

    const connect = (
      request: ReturnType<typeof createSession>["request"],
      bridgeToken: string,
      portId: string,
    ) => request(bridgeToken, { portId, hostName: "com.meru.test" });

    expect((await connect(first.request, bridgeToken, "first")).status).not.toBe(403);
    expect((await connect(second.request, bridgeToken, "second")).status).not.toBe(403);
    expect((await connect(first.request, "not-a-token", "third")).status).toBe(403);
  });

  test("forwards extension service worker console output to the logger", async () => {
    const logs: { level: string; message: string; details: Record<string, unknown> }[] = [];

    const { session, emitServiceWorkerConsole, serviceWorkerConsoleListeners } = createSession();

    const extensions = createExtensions([await createExtensionDir("one")], {
      info: (message, details) => {
        logs.push({ level: "info", message, details });
      },
      error: (message, details) => {
        logs.push({ level: "error", message, details });
      },
    });

    await extensions.setupSession(session);

    emitServiceWorkerConsole({
      message: "Failed to relay message to parent frame",
      level: 2,
      sourceUrl: "chrome-extension://aaa/background.js",
    });

    emitServiceWorkerConsole({
      message: "unlock failed",
      level: 3,
      sourceUrl: "chrome-extension://aaa/background.js",
    });

    // The session's own pages can run workers too, and they are not extensions
    emitServiceWorkerConsole({
      message: "mail worker chatter",
      level: 3,
      sourceUrl: "https://mail.google.com/worker.js",
    });

    const consoleLogs = logs.filter(({ message }) =>
      message.startsWith("Extension service worker"),
    );

    expect(consoleLogs).toEqual([
      {
        level: "info",
        message: "Extension service worker log",
        details: {
          sourceUrl: "chrome-extension://aaa/background.js",
          message: "Failed to relay message to parent frame",
        },
      },
      {
        level: "error",
        message: "Extension service worker error",
        details: {
          sourceUrl: "chrome-extension://aaa/background.js",
          message: "unlock failed",
        },
      },
    ]);

    extensions.teardownSession(session);

    expect(serviceWorkerConsoleListeners.size).toBe(0);
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

  test("derives again for the next session after a failed derive", async () => {
    const extensionDir = path.join(workDir, "healed");

    await mkdir(extensionDir);

    const extensions = createExtensions([extensionDir], {
      info: () => {},
      error: () => {},
    });

    const firstSession = createSession();

    await extensions.setupSession(firstSession.session);

    expect(extensions.getSessionActions(firstSession.session)).toHaveLength(0);

    // The directory is whole now — a finished install, a corrected dev folder
    await createExtensionDir("healed");

    const secondSession = createSession();

    await extensions.setupSession(secondSession.session);

    expect(extensions.getSessionActions(secondSession.session)).toHaveLength(1);
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

  test("matches a bare extension origin, which is all a permission check gets", async () => {
    const { session } = createSession();

    const extensions = createExtensions([await createExtensionDir("one")]);

    await extensions.setupSession(session);

    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa")).toBe(true);
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaa/")).toBe(true);
    expect(extensions.isLoadedExtensionUrl(session, "chrome-extension://aaabbb")).toBe(false);
  });

  test("reports an extension as loaded in that session only", async () => {
    const { session: sessionWithExtension } = createSession();
    const { session: sessionWithoutExtension } = createSession();

    const extensions = createExtensions([await createExtensionDir("one")]);

    await extensions.setupSession(sessionWithExtension);

    expect(extensions.isExtensionLoaded(sessionWithExtension, "aaa")).toBe(true);
    expect(extensions.isExtensionLoaded(sessionWithExtension, "bbb")).toBe(false);
    expect(extensions.isExtensionLoaded(sessionWithoutExtension, "aaa")).toBe(false);

    extensions.teardownSession(sessionWithExtension);

    expect(extensions.isExtensionLoaded(sessionWithExtension, "aaa")).toBe(false);
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

  test("reads a derived copy's icon once, however many sessions load it", async () => {
    const extensionDir = await createExtensionDir("one");

    await writeFile(path.join(extensionDir, "icon-48.png"), "icon");

    let derivedDir = "";

    const loadExtension = async (loadedDir: string) => {
      derivedDir = loadedDir;

      return createExtension("aaa", loadedDir, ACTION_MANIFEST);
    };

    const firstSession = createSession({ loadExtension });

    const secondSession = createSession({ loadExtension });

    const extensions = createExtensions([extensionDir]);

    await extensions.setupSession(firstSession.session);

    // The read the memo saves is the second session's, and taking the file away
    // is what tells a memoized read apart from a repeated one
    await rm(path.join(derivedDir, "icon-48.png"));

    await extensions.setupSession(secondSession.session);

    expect(extensions.getSessionActions(secondSession.session)[0]?.iconDataUrl).toBe(
      `data:image/png;base64,${Buffer.from("icon").toString("base64")}`,
    );
  });

  test("reads a derived copy's icon again for a later session when the read failed", async () => {
    let derivedDir = "";

    const loadExtension = async (loadedDir: string) => {
      derivedDir = loadedDir;

      return createExtension("aaa", loadedDir, ACTION_MANIFEST);
    };

    const firstSession = createSession({ loadExtension });

    const secondSession = createSession({ loadExtension });

    const extensions = createExtensions([await createExtensionDir("one")], {
      info: () => {},
      error: () => {},
    });

    await extensions.setupSession(firstSession.session);

    expect(extensions.getSessionActions(firstSession.session)[0]?.iconDataUrl).toBe(null);

    // What a transient failure looks like from here: the file the first read
    // could not find is there for the second
    await writeFile(path.join(derivedDir, "icon-48.png"), "icon");

    await extensions.setupSession(secondSession.session);

    expect(extensions.getSessionActions(secondSession.session)[0]?.iconDataUrl).toBe(
      `data:image/png;base64,${Buffer.from("icon").toString("base64")}`,
    );
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

describe("the shared instance's worker session", () => {
  /*
   * The real `createSharedExtensionInstance`, so what is under test is the
   * answer it gives the loader rather than a fake agreeing with the loader.
   * Its scripts have to exist, because the derive copies them into every copy.
   */
  async function createSharedInstance(workerSession: Session) {
    const shimScriptPath = path.join(workDir, "shim.js");

    const relayScriptPath = path.join(workDir, "relay.js");

    await writeFile(shimScriptPath, "// shim\n");

    await writeFile(relayScriptPath, "// relay\n");

    return createSharedExtensionInstance({
      shimScriptPath,
      relayScriptPath,
      getWorkerSession: () => workerSession,
    });
  }

  function createSharedExtensions(
    extensionDirs: ConstructorParameters<typeof Extensions>[0]["extensionDirs"],
    sharedInstance: ConstructorParameters<typeof Extensions>[0]["sharedInstance"],
    logger?: ConstructorParameters<typeof Extensions>[0]["logger"],
  ) {
    return new Extensions({
      extensionDirs,
      facadeScriptPath,
      derivedExtensionsDir: path.join(workDir, "derived"),
      sharedInstance,
      logger,
    });
  }

  /**
   * One extension id from every session, which is what a `manifest.key` buys,
   * and the derived directory each session was handed — which is where the
   * copy's own manifest is read from, rather than from anything the loader
   * says about it.
   */
  function createSharedSession() {
    const loadedDerivedDirs: string[] = [];

    const created = createSession({
      loadExtension: async (derivedDir: string) => {
        loadedDerivedDirs.push(derivedDir);

        return createExtension("aaa", derivedDir);
      },
    });

    return { ...created, loadedDerivedDirs };
  }

  async function readDerivedManifest(derivedDir: string) {
    return JSON.parse(await readFile(path.join(derivedDir, "manifest.json"), "utf8")) as {
      background?: unknown;
    };
  }

  /*
   * The invariant the whole design rests on: the worker is the session the
   * embedder named, so no other session ever carries a `background` key — not
   * the one that came first, and not one set up long afterwards, which is what
   * an account added while the app runs is.
   */
  test("every session but the named worker is content-script-only from its first load", async () => {
    const workerSession = createSharedSession();

    const firstAccountSession = createSharedSession();

    const extensions = createSharedExtensions(
      [await createExtensionDir("one")],
      await createSharedInstance(workerSession.session),
    );

    // Set up before the worker's, the order that used to decide the role
    await extensions.setupSession(firstAccountSession.session);

    await extensions.setupSession(workerSession.session);

    const lateAccountSession = createSharedSession();

    await extensions.setupSession(lateAccountSession.session);

    const [workerManifest, firstAccountManifest, lateAccountManifest] = await Promise.all(
      [workerSession, firstAccountSession, lateAccountSession].map(async ({ loadedDerivedDirs }) =>
        readDerivedManifest(loadedDerivedDirs[0] as string),
      ),
    );

    expect(workerManifest?.background).toEqual({
      service_worker: "chrome-facade-service-worker.js",
      type: "module",
    });

    expect(firstAccountManifest?.background).toBeUndefined();

    expect(lateAccountManifest?.background).toBeUndefined();
  });

  /*
   * The worker session is the embedder's own rather than an account's, so it
   * is worth pinning that the loader treats it as an ordinary session: one
   * bridge listener, no second one, and nothing extra because of the role.
   */
  test("the bridge attaches to the worker session exactly once, as to any other", async () => {
    const workerSession = createSharedSession();

    const accountSession = createSharedSession();

    const extensions = createSharedExtensions(
      [await createExtensionDir("one"), await createExtensionDir("two")],
      await createSharedInstance(workerSession.session),
    );

    await extensions.setupSession(workerSession.session);

    await extensions.setupSession(accountSession.session);

    // One filtered listener for the session, whatever it loaded into it, and
    // the same one the accounts get
    const bridgeFilter = [{ urls: [`${EXTENSION_BRIDGE_SCHEME}://*/*`] }];

    expect(workerSession.beforeSendHeadersFilters).toEqual(bridgeFilter);

    expect(accountSession.beforeSendHeadersFilters).toEqual(bridgeFilter);

    expect(workerSession.handledSchemes).toEqual([EXTENSION_BRIDGE_SCHEME]);

    expect(accountSession.handledSchemes).toEqual([EXTENSION_BRIDGE_SCHEME]);
  });

  /*
   * Both roles derive from the one source, and each role's copy is derived
   * once however many sessions ask for it: the memo is keyed by role and
   * source, and the two copies land in directories of their own. What would
   * otherwise happen is the two roles fighting over one directory, each
   * rewriting what the other just wrote, on every launch.
   */
  test("each role derives one copy, shared by every session that plays it", async () => {
    const workerSession = createSharedSession();

    const firstAccountSession = createSharedSession();

    const secondAccountSession = createSharedSession();

    const extensions = createSharedExtensions(
      [await createExtensionDir("one")],
      await createSharedInstance(workerSession.session),
    );

    await extensions.setupSession(workerSession.session);

    await extensions.setupSession(firstAccountSession.session);

    await extensions.setupSession(secondAccountSession.session);

    const [workerDir] = workerSession.loadedDerivedDirs;

    const [firstAccountDir] = firstAccountSession.loadedDerivedDirs;

    const [secondAccountDir] = secondAccountSession.loadedDerivedDirs;

    expect(firstAccountDir).toBe(secondAccountDir as string);

    expect(workerDir).not.toBe(firstAccountDir as string);
  });

  /*
   * The worker session's storage path is not a partition of its own: Electron's
   * default session answers `userData` itself, where an account's answers
   * `userData/Partitions/<accountId>`. So the store lands at a root the app
   * keeps its own files in, and what has to hold is that clearing it takes the
   * extension directories and nothing else — which is also why the embedder's
   * reset must not put a `clearStorageData()` next to this call.
   */
  test("clearing the worker session takes the extension data out of a userData root", async () => {
    const userDataPath = await createPartitionDir([
      "Local Extension Settings/aaa/000003.log",
      "Sync Extension Settings/aaa/000003.log",
      "Managed Extension Settings/aaa/000003.log",
      "Extension Rules/000003.log",
      "Extension Scripts/000003.log",
      "Extension State/000003.log",
      "IndexedDB/chrome-extension_aaa_0.indexeddb.leveldb/000003.log",
      // Everything below is the app's own, at the root only the default session
      // reports, and none of it is any extension's to clear
      "config.json",
      "logs/main.log",
      "extensions/com.1password/8.11.0/manifest.json",
      "derived-extensions/0123456789abcdef/manifest.json",
      "Partitions/account-one/Cookies",
    ]);

    const { session: workerSession } = createSession({ storagePath: userDataPath });

    const extensions = createSharedExtensions(
      [await createExtensionDir("one")],
      await createSharedInstance(workerSession),
    );

    await extensions.setupSession(workerSession);

    await extensions.clearSessionData(workerSession);

    expect(await listPartitionDir(userDataPath)).toEqual([
      "IndexedDB",
      "Partitions",
      path.join("Partitions", "account-one"),
      path.join("Partitions", "account-one", "Cookies"),
      "config.json",
      "derived-extensions",
      path.join("derived-extensions", "0123456789abcdef"),
      path.join("derived-extensions", "0123456789abcdef", "manifest.json"),
      "extensions",
      path.join("extensions", "com.1password"),
      path.join("extensions", "com.1password", "8.11.0"),
      path.join("extensions", "com.1password", "8.11.0", "manifest.json"),
      "logs",
      path.join("logs", "main.log"),
    ]);

    await fs.rm(userDataPath, { recursive: true, force: true });
  });

  test("tearing down an account session says nothing about the worker", async () => {
    const loggedErrors: string[] = [];

    const workerSession = createSharedSession();

    const accountSession = createSharedSession();

    const extensions = createSharedExtensions(
      [await createExtensionDir("one")],
      await createSharedInstance(workerSession.session),
      {
        info: () => undefined,
        error: (message) => {
          loggedErrors.push(message);
        },
      },
    );

    await extensions.setupSession(workerSession.session);

    await extensions.setupSession(accountSession.session);

    extensions.teardownSession(accountSession.session);

    expect(loggedErrors).toEqual([]);

    // And the worker is still the worker, so a session set up afterwards is
    // still content-script-only
    const lateAccountSession = createSharedSession();

    await extensions.setupSession(lateAccountSession.session);

    expect(
      (await readDerivedManifest(lateAccountSession.loadedDerivedDirs[0] as string))?.background,
    ).toBeUndefined();
  });

  /*
   * On an embedder naming a session no user can remove this is shutdown, and
   * the log is the proof: nothing in the app can reach it while the app runs,
   * and a naming that ever broke would leave this line in the log rather than
   * leaving the accounts silently unable to reach anything.
   */
  test("tearing down the worker session while others hold the extension is logged", async () => {
    const loggedErrors: string[] = [];

    const workerSession = createSharedSession();

    const accountSession = createSharedSession();

    const extensions = createSharedExtensions(
      [await createExtensionDir("one")],
      await createSharedInstance(workerSession.session),
      {
        info: () => undefined,
        error: (message) => {
          loggedErrors.push(message);
        },
      },
    );

    await extensions.setupSession(workerSession.session);

    await extensions.setupSession(accountSession.session);

    extensions.teardownSession(workerSession.session);

    expect(loggedErrors).toEqual(["Shared extension instance lost its worker session"]);
  });

  test("staying silent when the worker session was the last one", async () => {
    const loggedErrors: string[] = [];

    const workerSession = createSharedSession();

    const extensions = createSharedExtensions(
      [await createExtensionDir("one")],
      await createSharedInstance(workerSession.session),
      {
        info: () => undefined,
        error: (message) => {
          loggedErrors.push(message);
        },
      },
    );

    await extensions.setupSession(workerSession.session);

    extensions.teardownSession(workerSession.session);

    expect(loggedErrors).toEqual([]);
  });
});
