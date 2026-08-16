import type { Session } from "electron";

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
