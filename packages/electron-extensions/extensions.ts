import fs from "node:fs/promises";
import path from "node:path";
import type { Session } from "electron";

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

/** Where the loader reports what it did, since an embedder logs its own way. */
export type ExtensionsLogger = {
  info: (message: string, details: Record<string, unknown>) => void;
  error: (message: string, details: Record<string, unknown>) => void;
};

export type ExtensionsOptions = {
  /**
   * Unpacked extension directories, loaded into every session handed to
   * `setupSession`.
   */
  extensionDirs: string[];
  logger?: ExtensionsLogger;
};

/**
 * Loads unpacked extensions into Electron sessions and keeps track of what is
 * loaded where, so an embedder can unload them again and can tell whether a
 * `chrome-extension://` URL belongs to an extension it loaded itself.
 *
 * Chromium scopes an extension — content scripts, service worker, storage — to
 * the session it is loaded into, so the same directory loaded into several
 * sessions gives that many independent instances. Extensions are also forgotten
 * between launches, which is why loading happens on every boot.
 */
export class Extensions {
  private extensionDirs: string[];

  private logger: ExtensionsLogger | undefined;

  private loadedExtensionIdsBySession = new Map<Session, Set<string>>();

  constructor({ extensionDirs, logger }: ExtensionsOptions) {
    this.extensionDirs = extensionDirs;

    this.logger = logger;
  }

  async setupSession(session: Session) {
    if (this.extensionDirs.length === 0) {
      return;
    }

    const loadedExtensionIds = new Set<string>();

    this.loadedExtensionIdsBySession.set(session, loadedExtensionIds);

    for (const extensionDir of this.extensionDirs) {
      try {
        const extension = await session.extensions.loadExtension(extensionDir);

        // The session can be torn down while an extension is still loading
        if (this.loadedExtensionIdsBySession.get(session) !== loadedExtensionIds) {
          session.extensions.removeExtension(extension.id);

          return;
        }

        loadedExtensionIds.add(extension.id);

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
  }

  teardownSession(session: Session) {
    const loadedExtensionIds = this.loadedExtensionIdsBySession.get(session);

    if (!loadedExtensionIds) {
      return;
    }

    this.loadedExtensionIdsBySession.delete(session);

    for (const extensionId of loadedExtensionIds) {
      session.extensions.removeExtension(extensionId);

      this.logger?.info("Unloaded extension", { id: extensionId });
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
