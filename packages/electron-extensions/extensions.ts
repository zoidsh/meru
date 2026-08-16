import fs from "node:fs/promises";
import path from "node:path";
import type { Session } from "electron";
import {
  type ActionExtension,
  createExtensionAction,
  type ExtensionAction,
  readExtensionActionIcon,
} from "./action";
import { deriveExtension } from "./derive";
import type { ExtensionsLogger } from "./logger";
import {
  NativeMessaging,
  type NativeMessagingHostPolicy,
} from "./native-messaging/native-messaging";

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

export type ActionsChangedListener = (session: Session, actions: ExtensionAction[]) => void;

export type ExtensionsOptions = {
  /**
   * Unpacked extension directories, loaded into every session handed to
   * `setupSession`.
   */
  extensionDirs: string[];
  /**
   * The bundled `chrome.*` facade script, copied into every extension so it
   * runs in the extension's own contexts.
   */
  facadeScriptPath: string;
  /** A directory the loader owns, holding the copy it loads of each extension. */
  derivedExtensionsDir: string;
  /**
   * Narrows which native messaging hosts an extension may drive. Without it any
   * host that lists the extension in its own `allowed_origins` is reachable.
   */
  isNativeMessagingHostAllowed?: NativeMessagingHostPolicy;
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
  private extensionDirs: string[];

  private facadeScriptPath: string;

  private derivedExtensionsDir: string;

  private logger: ExtensionsLogger | undefined;

  private loadedExtensionIdsBySession = new Map<Session, Set<string>>();

  private actionsBySession = new Map<Session, ExtensionAction[]>();

  private actionsChangedListeners = new Set<ActionsChangedListener>();

  private derivedExtensions = new Map<string, ReturnType<typeof deriveExtension>>();

  private nativeMessaging: NativeMessaging;

  constructor({
    extensionDirs,
    facadeScriptPath,
    derivedExtensionsDir,
    isNativeMessagingHostAllowed,
    logger,
  }: ExtensionsOptions) {
    this.extensionDirs = extensionDirs;

    this.facadeScriptPath = facadeScriptPath;

    this.derivedExtensionsDir = derivedExtensionsDir;

    this.logger = logger;

    this.nativeMessaging = new NativeMessaging({
      isHostAllowed: isNativeMessagingHostAllowed,
      logger,
    });
  }

  /**
   * The copy of an extension that carries the facade. Sessions share it the way
   * they shared the source directory: one copy on disk, one instance per
   * session.
   */
  private deriveExtension(sourceDir: string) {
    let derivedExtension = this.derivedExtensions.get(sourceDir);

    if (!derivedExtension) {
      derivedExtension = deriveExtension({
        sourceDir,
        derivedExtensionsDir: this.derivedExtensionsDir,
        facadeScriptPath: this.facadeScriptPath,
      });

      this.derivedExtensions.set(sourceDir, derivedExtension);
    }

    return derivedExtension;
  }

  async setupSession(session: Session) {
    if (this.extensionDirs.length === 0) {
      return;
    }

    const loadedExtensionIds = new Set<string>();

    this.loadedExtensionIdsBySession.set(session, loadedExtensionIds);

    const actions: ExtensionAction[] = [];

    this.actionsBySession.set(session, actions);

    const extensionIdsByBridgeToken = new Map<string, string>();

    this.nativeMessaging.setupSession(session, {
      getExtensionId: (bridgeToken) => extensionIdsByBridgeToken.get(bridgeToken),
    });

    for (const extensionDir of this.extensionDirs) {
      try {
        const { derivedDir, bridgeToken } = await this.deriveExtension(extensionDir);

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

    this.nativeMessaging.teardownSession(session);

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

  isLoadedExtensionUrl(session: Session, url: string) {
    const loadedExtensionIds = this.loadedExtensionIdsBySession.get(session);

    if (!loadedExtensionIds) {
      return false;
    }

    for (const extensionId of loadedExtensionIds) {
      if (url.startsWith(`chrome-extension://${extensionId}/`)) {
        return true;
      }
    }

    return false;
  }
}
