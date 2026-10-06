import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ExtensionBridge } from "../bridge/bridge";
import type { ExtensionsLogger } from "../logger";
import {
  type GrantedPermissionsResponse,
  PERMISSIONS_PATHS,
  type PermissionsChangeRequest,
} from "./bridge-protocol";

/**
 * Which optional permissions an extension may be granted, by the id it is
 * loaded as. Nothing outside the list it answers can ever be granted, which is
 * what bounds the store: a grant is one of finitely many strings the embedder
 * named, so no volume of `request` calls can grow the file an extension's
 * entry holds.
 */
export type GrantableOptionalPermissionsPolicy = (extensionId: string) => string[] | undefined;

export type PermissionsOptions = {
  /**
   * The JSON file the grants are kept in, keyed by extension id. Without one a
   * grant lasts as long as the app runs, where Chrome's survives a restart.
   */
  storePath?: string;
  getGrantableOptionalPermissions?: GrantableOptionalPermissionsPolicy;
  logger?: ExtensionsLogger;
};

type GrantedPermissionsStore = Record<string, string[]>;

/**
 * What `chrome.permissions.request` has granted each extension, kept in the
 * main process because Chrome's grant outlives the context that asked for it
 * and the launch it was asked in.
 *
 * Per extension id and not per session, which is Chrome's own shape: one
 * install holds one set of permissions. Meru splits an install across sessions
 * — the worker in one, a content-script-only copy in each account — and those
 * are one extension to the user, so a grant made in the worker is what every
 * other context of that extension sees. Which extension is asking comes from
 * the bridge, so an extension can only ever read and change its own.
 *
 * Nothing here grants a capability. Chromium's own permissions are whatever the
 * derived manifest declared, and this store is only the honest answer to
 * `contains` and `getAll` for an optional permission whose feature the facade
 * serves — `nativeMessaging` being the one that matters, where the transport is
 * the facade's rather than Chromium's. A blanket `true` from `contains` is what
 * the earlier survey measured sending Bitwarden into a `connectNative` retry
 * loop, so a permission reads as granted only once it was asked for and
 * allowed.
 */
export class Permissions {
  private storePath: string | undefined;

  private getGrantableOptionalPermissions: GrantableOptionalPermissionsPolicy | undefined;

  private logger: ExtensionsLogger | undefined;

  /** Read from the store on the first call that needs it, and then kept. */
  private loading: Promise<Map<string, Set<string>>> | undefined;

  /** Writes run one after another, so the last call is what lands on disk. */
  private writing: Promise<void> = Promise.resolve();

  constructor({ storePath, getGrantableOptionalPermissions, logger }: PermissionsOptions = {}) {
    this.storePath = storePath;

    this.getGrantableOptionalPermissions = getGrantableOptionalPermissions;

    this.logger = logger;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(PERMISSIONS_PATHS.granted, async ({ extensionId, headers }) =>
      Response.json(await this.answerGranted(extensionId), { headers }),
    );

    bridge.handle(PERMISSIONS_PATHS.request, async ({ extensionId, body, headers }) => {
      await this.grant(extensionId, readPermissions(body));

      return Response.json(await this.answerGranted(extensionId), { headers });
    });

    bridge.handle(PERMISSIONS_PATHS.remove, async ({ extensionId, body, headers }) => {
      await this.revoke(extensionId, readPermissions(body));

      return Response.json(await this.answerGranted(extensionId), { headers });
    });
  }

  /**
   * Filtered through the policy as it stands rather than as it stood at the
   * grant, so a permission the embedder stops allowing stops reading as held
   * without an uninstall: one that stayed `true` after Meru stopped serving its
   * feature is the `connectNative` retry loop again.
   */
  async getGranted(extensionId: string) {
    const grantable = this.getGrantable(extensionId);

    return [...((await this.load()).get(extensionId) ?? [])].filter((permission) =>
      grantable.includes(permission),
    );
  }

  /**
   * Grants all of `permissions` or none of them, as Chrome's prompt does, so an
   * extension told its request was declined never finds part of it held. A
   * permission already granted is granted again without a write, since an
   * extension that asks on every boot — which is what a worker restart looks
   * like — would otherwise rewrite the store each time.
   */
  async grant(extensionId: string, permissions: string[]) {
    const grantable = this.getGrantable(extensionId);

    if (!permissions.every((permission) => grantable.includes(permission))) {
      return;
    }

    const granted = await this.load();

    const extensionGranted = granted.get(extensionId) ?? new Set<string>();

    let hasChanged = false;

    for (const permission of permissions) {
      if (extensionGranted.has(permission)) {
        continue;
      }

      extensionGranted.add(permission);

      hasChanged = true;
    }

    if (!hasChanged) {
      return;
    }

    granted.set(extensionId, extensionGranted);

    this.logger?.info("Granted optional extension permissions", { extensionId, permissions });

    await this.persist(granted);
  }

  async revoke(extensionId: string, permissions: string[]) {
    const granted = await this.load();

    const extensionGranted = granted.get(extensionId);

    if (!extensionGranted) {
      return;
    }

    let hasChanged = false;

    for (const permission of permissions) {
      hasChanged = extensionGranted.delete(permission) || hasChanged;
    }

    if (hasChanged) {
      await this.persist(granted);
    }
  }

  /**
   * What an uninstall drops. Chrome's grants go with the install, so a
   * reinstall under the same id starts from the manifest again rather than
   * finding a permission the user allowed an extension they removed.
   */
  async clear(extensionId: string) {
    const granted = await this.load();

    if (granted.delete(extensionId)) {
      await this.persist(granted);
    }
  }

  private getGrantable(extensionId: string) {
    return this.getGrantableOptionalPermissions?.(extensionId) ?? [];
  }

  private async answerGranted(extensionId: string) {
    return { permissions: await this.getGranted(extensionId) } satisfies GrantedPermissionsResponse;
  }

  private load() {
    this.loading ??= this.readStore();

    return this.loading;
  }

  private async readStore() {
    const granted = new Map<string, Set<string>>();

    if (!this.storePath) {
      return granted;
    }

    let source: string;

    try {
      source = await readFile(this.storePath, "utf8");
    } catch {
      // No store yet, which is every launch before the first grant
      return granted;
    }

    try {
      for (const [extensionId, permissions] of Object.entries(
        JSON.parse(source) as GrantedPermissionsStore,
      )) {
        granted.set(extensionId, new Set(readPermissions({ permissions })));
      }
    } catch (error) {
      // A store that will not parse costs the grants in it and a `request` the
      // extension makes again. Throwing would cost every permissions call,
      // including the `contains` an extension cannot survive the absence of
      this.logger?.error("Failed to read granted extension permissions", {
        path: this.storePath,
        error,
      });
    }

    return granted;
  }

  /**
   * Writes the whole store, through a temporary file and a rename: a launch
   * that read a half-written file would lose every grant in it, and the rename
   * is the one step a crash cannot leave half done.
   *
   * A failed write is logged and otherwise swallowed, so the grant still stands
   * for this launch and the next call still gets its turn at the chain.
   */
  private async persist(granted: Map<string, Set<string>>) {
    const { storePath } = this;

    if (!storePath) {
      return;
    }

    const store: GrantedPermissionsStore = {};

    for (const [extensionId, permissions] of granted) {
      if (permissions.size > 0) {
        store[extensionId] = [...permissions];
      }
    }

    this.writing = this.writing.then(async () => {
      try {
        await writeStore(storePath, store);
      } catch (error) {
        this.logger?.error("Failed to write granted extension permissions", {
          path: storePath,
          error,
        });
      }
    });

    await this.writing;
  }
}

async function writeStore(storePath: string, store: GrantedPermissionsStore) {
  await mkdir(path.dirname(storePath), { recursive: true });

  const temporaryPath = `${storePath}.tmp`;

  await writeFile(temporaryPath, JSON.stringify(store, null, 2));

  await rename(temporaryPath, storePath);
}

function readPermissions(body: Record<string, unknown>) {
  const { permissions } = body as unknown as PermissionsChangeRequest;

  return Array.isArray(permissions)
    ? permissions.filter((permission): permission is string => typeof permission === "string")
    : [];
}
