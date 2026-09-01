import fs from "node:fs/promises";
import path from "node:path";
import type { Event as ElectronEvent, MessageDetails, Session } from "electron";
import {
  type ActionExtension,
  createExtensionAction,
  type ExtensionAction,
  readExtensionActionIcon,
} from "./action";
import { ExtensionBridge } from "./bridge/bridge";
import { deriveExtension, type SharedInstanceDeriveOptions } from "./derive";
import type { ExtensionsLogger } from "./logger";
import {
  NativeMessaging,
  type NativeMessagingHostPolicy,
} from "./native-messaging/native-messaging";
import { readExtensionDirId } from "./scan";
import { WebNavigation } from "./web-navigation/web-navigation";

/**
 * Chromium keeps every `chrome.storage` area of every extension in its own
 * directory inside the session's partition, next to the browsing data.
 */
const EXTENSION_STORAGE_DIR_NAMES = [
  "Local Extension Settings",
  "Sync Extension Settings",
  "Managed Extension Settings",
  "Extension Rules",
  "Extension Scripts",
  "Extension State",
];

/** `IndexedDB/chrome-extension_<extensionId>_0.indexeddb.leveldb` and friends. */
const EXTENSION_INDEXED_DB_PREFIX = "chrome-extension_";

/** Chromium's console levels run verbose, info, warning, error — 0 to 3. */
const CONSOLE_ERROR_LEVEL = 3;

export type ActionsChangedListener = (session: Session, actions: ExtensionAction[]) => void;

export type ExtensionDirs = string[] | (() => Promise<string[]> | string[]);

/**
 * One extension instance serving every session, in place of the independent
 * instance per session everything above describes. The loader stays out of
 * how: it hands over its bridge once, asks what part each session plays as the
 * session is set up — the answer is the derive option shaping that session's
 * copy — and reports each session's teardown. `runtime-proxy/` holds the one
 * implementation, and an embedder that never passes one runs exactly as
 * before.
 */
export type SharedExtensionInstance = {
  /** Called once, from the loader's constructor. */
  install(context: { bridge: ExtensionBridge; logger?: ExtensionsLogger }): void;
  /** Called per session before its extensions derive. */
  adoptSession(session: Session): SharedInstanceDeriveOptions;
  teardownSession(session: Session): void;
};

export type ExtensionsOptions = {
  /**
   * Unpacked extension directories, loaded into every session handed to
   * `setupSession`. A function is asked again for every session, so a session
   * set up after an extension was installed loads that extension too.
   *
   * Where two directories carry the same extension id, only the first is
   * loaded; see `dedupeExtensionDirs`.
   */
  extensionDirs: ExtensionDirs;
  /**
   * The bundled `chrome.*` facade script, copied into every extension so it
   * runs in the extension's own contexts.
   */
  facadeScriptPath: string;
  /** A directory the loader owns, holding the copy it loads of each extension. */
  derivedExtensionsDir: string;
  /**
   * Manifest keys every extension is derived without, for taking a part of an
   * extension away — `content_scripts`, `declarative_net_request` — to find out
   * which one is behind a misbehaving page.
   */
  strippedManifestKeys?: string[];
  /**
   * Narrows where an extension's content scripts run, asked for by the id the
   * extension is loaded as. Without it every extension injects wherever its own
   * manifest says, which for a password manager is every frame of every view.
   */
  getContentScriptMatches?: (extensionId: string) => string[] | undefined;
  /**
   * Narrows which native messaging hosts an extension may drive. Without it any
   * host that lists the extension in its own `allowed_origins` is reachable.
   */
  isNativeMessagingHostAllowed?: NativeMessagingHostPolicy;
  /**
   * Lets one extension instance serve every session
   * (`createSharedExtensionInstance` in `runtime-proxy/`). Without it every
   * session runs its own.
   */
  sharedInstance?: SharedExtensionInstance;
  logger?: ExtensionsLogger;
};

/**
 * Loads unpacked extensions into Electron sessions and keeps track of what is
 * loaded where, so an embedder can unload them again, can tell whether a
 * `chrome-extension://` URL belongs to an extension it loaded itself, and can
 * draw a toolbar button for each of them.
 *
 * Chromium scopes an extension — content scripts, service worker, storage — to
 * the session it is loaded into, so the same directory loaded into several
 * sessions gives that many independent instances. Extensions are also forgotten
 * between launches, which is why loading happens on every boot.
 */
export class Extensions {
  private extensionDirs: ExtensionDirs;

  private facadeScriptPath: string;

  private derivedExtensionsDir: string;

  private strippedManifestKeys: string[] | undefined;

  private getContentScriptMatches: ExtensionsOptions["getContentScriptMatches"];

  private sharedInstance: SharedExtensionInstance | undefined;

  private logger: ExtensionsLogger | undefined;

  private loadedExtensionIdsBySession = new Map<Session, Set<string>>();

  private actionsBySession = new Map<Session, ExtensionAction[]>();

  private actionsChangedListeners = new Set<ActionsChangedListener>();

  private derivedExtensions = new Map<string, ReturnType<typeof deriveExtension>>();

  private bridge: ExtensionBridge;

  private nativeMessaging: NativeMessaging;

  private webNavigation: WebNavigation;

  private serviceWorkerConsoleListeners = new Map<
    Session,
    (event: ElectronEvent, messageDetails: MessageDetails) => void
  >();

  constructor({
    extensionDirs,
    facadeScriptPath,
    derivedExtensionsDir,
    strippedManifestKeys,
    getContentScriptMatches,
    isNativeMessagingHostAllowed,
    sharedInstance,
    logger,
  }: ExtensionsOptions) {
    this.extensionDirs = extensionDirs;

    this.facadeScriptPath = facadeScriptPath;

    this.derivedExtensionsDir = derivedExtensionsDir;

    this.strippedManifestKeys = strippedManifestKeys;

    this.getContentScriptMatches = getContentScriptMatches;

    this.sharedInstance = sharedInstance;

    this.logger = logger;

    this.bridge = new ExtensionBridge({ logger });

    this.nativeMessaging = new NativeMessaging({
      isHostAllowed: isNativeMessagingHostAllowed,
      logger,
    });

    this.nativeMessaging.registerRoutes(this.bridge);

    this.webNavigation = new WebNavigation();

    this.webNavigation.registerRoutes(this.bridge);

    this.sharedInstance?.install({ bridge: this.bridge, logger });
  }

  /**
   * The copy of an extension that carries the facade. Sessions share it the way
   * they shared the source directory: one copy on disk, one instance per
   * session.
   */
  private deriveExtension(sourceDir: string, sharedInstanceDerive?: SharedInstanceDeriveOptions) {
    // One derived copy per role, since a launch with a shared instance loads
    // the worker copy into one session and the content-script-only copy into
    // the rest, both from the one source
    const derivedExtensionKey = `${sharedInstanceDerive?.role ?? "default"}\0${sourceDir}`;

    let derivedExtension = this.derivedExtensions.get(derivedExtensionKey);

    if (!derivedExtension) {
      derivedExtension = deriveExtension({
        sourceDir,
        derivedExtensionsDir: this.derivedExtensionsDir,
        facadeScriptPath: this.facadeScriptPath,
        strippedManifestKeys: this.strippedManifestKeys,
        getContentScriptMatches: this.getContentScriptMatches,
        sharedInstance: sharedInstanceDerive,
      });

      this.derivedExtensions.set(derivedExtensionKey, derivedExtension);

      // A failure must not be the answer for every later session: dropped from
      // the memo, the next setup derives again and can succeed once whatever
      // failed — an unfinished install, a half-written dev directory — is gone
      const failedDerivedExtension = derivedExtension;

      derivedExtension.catch(() => {
        if (this.derivedExtensions.get(derivedExtensionKey) === failedDerivedExtension) {
          this.derivedExtensions.delete(derivedExtensionKey);
        }
      });
    }

    return derivedExtension;
  }

  /**
   * The directories to load, without the ones carrying an extension id an
   * earlier directory already carries. Two copies of one extension are one
   * extension to Chromium, which loads them both under that id: the second load
   * clears the storage the first just made, the service worker registration
   * with it, and which copy ends up running is nowhere to be seen. First in the
   * list wins, so the embedder picks the copy purely by the order it lists them
   * in.
   *
   * A directory whose manifest carries no `key` has no id and is never dropped,
   * since Chromium derives that extension's id from the path it loads from and
   * two such directories are two different extensions.
   */
  private dedupeExtensionDirs(extensionDirs: string[]) {
    const seenExtensionIds = new Set<string>();

    return extensionDirs.filter((extensionDir) => {
      const extensionId = readExtensionDirId(extensionDir);

      if (!extensionId) {
        return true;
      }

      if (seenExtensionIds.has(extensionId)) {
        this.logger?.info("Skipped duplicate extension directory", {
          id: extensionId,
          extensionDir,
        });

        return false;
      }

      seenExtensionIds.add(extensionId);

      return true;
    });
  }

  async setupSession(session: Session) {
    const extensionDirs = this.dedupeExtensionDirs(
      typeof this.extensionDirs === "function" ? await this.extensionDirs() : this.extensionDirs,
    );

    if (extensionDirs.length === 0) {
      return;
    }

    const loadedExtensionIds = new Set<string>();

    this.loadedExtensionIdsBySession.set(session, loadedExtensionIds);

    const actions: ExtensionAction[] = [];

    this.actionsBySession.set(session, actions);

    const extensionIdsByBridgeToken = new Map<string, string>();

    this.bridge.setupSession(session, {
      getExtensionId: (bridgeToken) => extensionIdsByBridgeToken.get(bridgeToken),
    });

    this.pipeServiceWorkerConsole(session);

    const sharedInstanceDerive = this.sharedInstance?.adoptSession(session);

    for (const extensionDir of extensionDirs) {
      try {
        const { derivedDir, bridgeToken, extensionId } = await this.deriveExtension(
          extensionDir,
          sharedInstanceDerive,
        );

        await this.dropServiceWorkerRegistration(session, extensionId);

        const extension = await session.extensions.loadExtension(derivedDir);

        // The session can be torn down while an extension is still loading
        if (this.loadedExtensionIdsBySession.get(session) !== loadedExtensionIds) {
          session.extensions.removeExtension(extension.id);

          return;
        }

        loadedExtensionIds.add(extension.id);

        extensionIdsByBridgeToken.set(bridgeToken, extension.id);

        actions.push(await this.createAction(extension));

        this.logger?.info("Loaded extension", {
          id: extension.id,
          name: extension.name,
          version: extension.version,
          extensionDir,
        });
      } catch (error) {
        this.logger?.error("Failed to load extension", { extensionDir, error });
      }
    }

    this.emitActionsChanged(session);
  }

  /**
   * Chromium stores an extension's service worker script when the worker first
   * registers and serves that copy for as long as the partition exists: it
   * never fetches the script again, not on a later launch and not when the file
   * on disk has changed. Everything the derive writes into the worker — the
   * facade above all, and the bridge token it carries — would therefore be a
   * copy from the launch the partition was created in, which is what answered
   * every native messaging call with 403 (measured 2026-08-16).
   *
   * Dropping the registration first makes Chromium fetch the script again.
   * `clearData` walks past `chrome-extension://` origins, so `clearStorageData`
   * is the way in; an extension without a `manifest.key` has no id to address
   * its storage by and keeps the worker Chromium already has.
   */
  private async dropServiceWorkerRegistration(session: Session, extensionId: string | undefined) {
    if (!extensionId) {
      return;
    }

    await session.clearStorageData({
      origin: `chrome-extension://${extensionId}`,
      storages: ["serviceworkers"],
    });
  }

  /**
   * An extension's service worker has no page and no devtools anywhere in the
   * embedding app, so what it writes to its console — 1Password saying why it
   * declined to fill, say — surfaces nowhere unless it is forwarded to the
   * logger. Every worker on a `chrome-extension://` origin is one this loader
   * put there, since nothing else loads extensions into the session.
   */
  private pipeServiceWorkerConsole(session: Session) {
    const listener = (_event: ElectronEvent, { message, level, sourceUrl }: MessageDetails) => {
      if (!sourceUrl.startsWith("chrome-extension://")) {
        return;
      }

      if (level >= CONSOLE_ERROR_LEVEL) {
        this.logger?.error("Extension service worker error", { sourceUrl, message });
      } else {
        this.logger?.info("Extension service worker log", { sourceUrl, message });
      }
    };

    this.serviceWorkerConsoleListeners.set(session, listener);

    session.serviceWorkers.on("console-message", listener);
  }

  /** A broken icon costs the button its icon, not the extension its button. */
  private async createAction(extension: ActionExtension) {
    const action = createExtensionAction(extension);

    try {
      action.iconDataUrl = await readExtensionActionIcon(extension);
    } catch (error) {
      this.logger?.error("Failed to read extension action icon", { id: extension.id, error });
    }

    return action;
  }

  teardownSession(session: Session) {
    const loadedExtensionIds = this.loadedExtensionIdsBySession.get(session);

    if (!loadedExtensionIds) {
      return;
    }

    this.loadedExtensionIdsBySession.delete(session);

    this.actionsBySession.delete(session);

    this.bridge.teardownSession(session);

    this.nativeMessaging.teardownSession(session);

    this.sharedInstance?.teardownSession(session);

    const consoleListener = this.serviceWorkerConsoleListeners.get(session);

    if (consoleListener) {
      this.serviceWorkerConsoleListeners.delete(session);

      session.serviceWorkers.removeListener("console-message", consoleListener);
    }

    for (const extensionId of loadedExtensionIds) {
      session.extensions.removeExtension(extensionId);

      this.logger?.info("Unloaded extension", { id: extensionId });
    }

    this.emitActionsChanged(session);
  }

  /**
   * The toolbar buttons an embedder draws for this session, in the order the
   * extensions were loaded. Empty until the extensions have finished loading,
   * which is what `onActionsChanged` is for.
   */
  getSessionActions(session: Session): ExtensionAction[] {
    return this.actionsBySession.get(session) ?? [];
  }

  /** Fires whenever the extensions loaded into a session change. */
  onActionsChanged(listener: ActionsChangedListener) {
    this.actionsChangedListeners.add(listener);

    return () => {
      this.actionsChangedListeners.delete(listener);
    };
  }

  private emitActionsChanged(session: Session) {
    for (const listener of this.actionsChangedListeners) {
      listener(session, this.getSessionActions(session));
    }
  }

  /**
   * Deletes what the extensions in this session wrote to disk. `chrome.storage`
   * is none of the browsing data Chromium keeps per origin, and the one part
   * that is — an extension's IndexedDB — `session.clearData()` walks past
   * unless it is handed that extension's origin.
   *
   * Everything the partition holds for an extension goes, not just for the
   * extensions loaded into this session, since an extension the embedder no
   * longer loads left its storage behind all the same.
   */
  async clearSessionData(session: Session) {
    const storagePath = session.getStoragePath();

    if (!storagePath) {
      return;
    }

    const extensionDataPaths = [
      ...EXTENSION_STORAGE_DIR_NAMES.map((dirName) => path.join(storagePath, dirName)),
      ...(await this.getExtensionIndexedDbPaths(storagePath)),
    ];

    await Promise.all(
      extensionDataPaths.map(async (extensionDataPath) => {
        try {
          // Chromium can still hold the LevelDB files open right after
          // unloading an extension, which fails the delete on Windows
          await fs.rm(extensionDataPath, {
            recursive: true,
            force: true,
            maxRetries: 5,
            retryDelay: 100,
          });
        } catch (error) {
          this.logger?.error("Failed to clear extension data", { path: extensionDataPath, error });
        }
      }),
    );

    this.logger?.info("Cleared extension data", { storagePath });
  }

  private async getExtensionIndexedDbPaths(storagePath: string) {
    const indexedDbPath = path.join(storagePath, "IndexedDB");

    try {
      const entryNames = await fs.readdir(indexedDbPath);

      return entryNames
        .filter((entryName) => entryName.startsWith(EXTENSION_INDEXED_DB_PREFIX))
        .map((entryName) => path.join(indexedDbPath, entryName));
    } catch {
      return [];
    }
  }

  /**
   * Whether one particular extension is loaded into this session, for stepping
   * a behavior of the embedder's own aside while the extension takes it over —
   * a password manager overriding WebAuthn in the page, say.
   */
  isExtensionLoaded(session: Session, extensionId: string) {
    return this.loadedExtensionIdsBySession.get(session)?.has(extensionId) ?? false;
  }

  /**
   * Whether a URL belongs to an extension loaded into this session. A bare
   * origin counts, since that is all a permission check is given, and Chromium
   * serializes one with and without its trailing slash depending on where it
   * came from.
   */
  isLoadedExtensionUrl(session: Session, url: string) {
    const loadedExtensionIds = this.loadedExtensionIdsBySession.get(session);

    if (!loadedExtensionIds) {
      return false;
    }

    for (const extensionId of loadedExtensionIds) {
      const extensionOrigin = `chrome-extension://${extensionId}`;

      if (url === extensionOrigin || url.startsWith(`${extensionOrigin}/`)) {
        return true;
      }
    }

    return false;
  }
}
