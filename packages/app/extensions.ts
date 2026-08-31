import path from "node:path";
import { is } from "@electron-toolkit/utils";
import {
  createSharedExtensionInstance,
  Extensions,
  findExtensionDirs,
  getInstalledExtension,
  installLatestExtension,
  type LatestExtensionInstall,
  pruneDerivedExtensions,
  pruneExtensionVersions,
  registerExtensionBridgeScheme,
  uninstallExtension,
} from "@meru/electron-extensions";
import { EXTENSIONS_ENABLED } from "@meru/shared/build-features";
import { curatedExtensions, isCuratedExtensionId } from "@meru/shared/extensions";
import { ms } from "@meru/shared/ms";
import type { ExtensionUpdateResult, InstalledExtensionState } from "@meru/shared/types";
import { app } from "electron";
import { serializeError } from "serialize-error";
import { config } from "@/config";
import { log } from "@/lib/log";
import { licenseKey } from "@/license-key";

/**
 * Where the curated extensions are installed, `<installDir>/<id>/<version>`, and
 * where the loader keeps the copies it derives from them.
 *
 * Empty on a build without extensions. Everything that reads them is compiled
 * out, but a `path.join` is a call the bundler has to assume does something, so
 * left alone these two would be the whole feature's only surviving trace in the
 * bundle.
 */
const INSTALL_DIR = EXTENSIONS_ENABLED ? path.join(app.getPath("userData"), "extensions") : "";

const DERIVED_EXTENSIONS_DIR = EXTENSIONS_ENABLED
  ? path.join(app.getPath("userData"), "derived-extensions")
  : "";

/**
 * Unpacked extensions to load on top of the installed ones, one directory
 * holding a `manifest.json` per extension:
 *
 *   <repo root>/extensions/1password/manifest.json
 *
 * The folder is gitignored, and `app.getAppPath()` is the repo root in
 * development because `bun run dev` starts Electron as `electron .` there.
 */
function getDevExtensionDirs() {
  if (!is.dev) {
    return [];
  }

  return findExtensionDirs(path.join(app.getAppPath(), "extensions"));
}

/**
 * Whether this run loads the checked-in fixture extension
 * (`packages/electron-extensions/fixture`): always in development, and behind
 * this flag in a packaged build, which is what the end-to-end suite runs. The
 * flag is a boolean on purpose — one that took a path would hand a shipped
 * Meru "load any unpacked extension into every account session" from an
 * environment variable, around both the curated catalog and the license gate.
 * Set, it can only ever enable the fixture the app already carries.
 */
function isFixtureExtensionEnabled() {
  return Boolean(process.env.MERU_EXTENSIONS_FIXTURE);
}

/**
 * The bundled fixture, which `scripts/build.ts` assembles into
 * `build-js/fixture-extension`. That directory is `asarUnpack`ed, because
 * deriving reads and copies it as plain files; in development the app path is
 * the repo root and the replace matches nothing.
 */
function getFixtureExtensionDirs() {
  if (!is.dev && !isFixtureExtensionEnabled()) {
    return [];
  }

  return [
    path
      .join(app.getAppPath(), "build-js", "fixture-extension")
      .replace("app.asar", "app.asar.unpacked"),
  ];
}

/**
 * `MERU_EXTENSIONS_STRIP=content_scripts,declarative_net_request` derives every
 * extension without those manifest keys, so a run can tell which part of an
 * extension a page is reacting to. Development only, like the extensions
 * themselves.
 */
function getStrippedManifestKeys() {
  if (!is.dev) {
    return [];
  }

  return (process.env.MERU_EXTENSIONS_STRIP ?? "")
    .split(",")
    .map((manifestKey) => manifestKey.trim())
    .filter(Boolean);
}

/** The curated extensions the user opted into, and Pro is what they run on. */
function getOptedInExtensionIds() {
  if (!licenseKey.isValid) {
    return [];
  }

  return config
    .get("extensions.installed")
    .filter((extensionId) => isCuratedExtensionId(extensionId));
}

async function getInstalledExtensionDirs() {
  const extensionDirs: string[] = [];

  for (const extensionId of getOptedInExtensionIds()) {
    const installedExtension = await getInstalledExtension({
      installDir: INSTALL_DIR,
      extensionId,
    });

    if (installedExtension) {
      extensionDirs.push(installedExtension.extensionDir);
    }
  }

  return extensionDirs;
}

/**
 * Everything an account session loads: what the user opted into, plus the
 * development folder. Asked again for every session, so an account created
 * after an install gets that extension without anything being rebuilt.
 */
async function getExtensionDirs() {
  return [
    ...getDevExtensionDirs(),
    ...getFixtureExtensionDirs(),
    ...(await getInstalledExtensionDirs()),
  ];
}

/**
 * Where a curated extension's content scripts may run, from the catalog entry it
 * is offered under. An extension the catalog says nothing about — a development
 * folder — runs its content scripts as its author declared them.
 */
function getContentScriptMatches(extensionId: string) {
  return curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
    ?.contentScriptMatches;
}

/**
 * What the rest of the app calls the extension layer through. Naming the subset
 * it actually uses is what lets a build without extensions answer with an inert
 * object of the same shape rather than making every call site check first.
 */
type AppExtensions = Pick<
  Extensions,
  | "setupSession"
  | "teardownSession"
  | "clearSessionData"
  | "getSessionActions"
  | "onActionsChanged"
  | "isExtensionLoaded"
  | "isLoadedExtensionUrl"
>;

/**
 * The extension layer on a build that carries none: no session is ever set up,
 * so no extension is loaded and no action exists, and the answers say so. The
 * passkey dialog in `WorkspaceApp` is the one caller whose behavior this
 * decides, and `false` there is what it did before extensions existed.
 */
const inertExtensions: AppExtensions = {
  setupSession: async () => {},
  teardownSession: () => {},
  clearSessionData: async () => {},
  getSessionActions: () => [],
  onActionsChanged: () => () => {},
  isExtensionLoaded: () => false,
  isLoadedExtensionUrl: () => false,
};

if (EXTENSIONS_ENABLED) {
  // Extension contexts reach the main process over the bridge's custom scheme,
  // and Electron only takes scheme privileges while modules are still loading.
  // It can't be deferred, which is why the constant is read here at module
  // level rather than around the call sites.
  registerExtensionBridgeScheme();
}

export const extensions: AppExtensions = EXTENSIONS_ENABLED
  ? new Extensions({
      extensionDirs: getExtensionDirs,
      facadeScriptPath: path.join(__dirname, "extensions-chrome-facade.js"),
      derivedExtensionsDir: DERIVED_EXTENSIONS_DIR,
      strippedManifestKeys: getStrippedManifestKeys(),
      getContentScriptMatches,
      // One shared extension instance across all account sessions — one 1Password
      // sign-in instead of one per account. It has never been run against
      // 1Password itself, so nothing loads it by default: development builds opt
      // in with MERU_EXTENSIONS_SHARED_INSTANCE=1, the end-to-end suite does the
      // same alongside the fixture flag — its packaged build is the only automated
      // coverage the runtime proxy has — and deleting this one option removes the
      // whole feature.
      sharedInstance:
        (is.dev || isFixtureExtensionEnabled()) && process.env.MERU_EXTENSIONS_SHARED_INSTANCE
          ? createSharedExtensionInstance({
              shimScriptPath: path.join(__dirname, "extensions-runtime-proxy-shim.js"),
              relayScriptPath: path.join(__dirname, "extensions-runtime-proxy-relay.js"),
            })
          : undefined,
      logger: {
        info: (message, details) => {
          log.info(message, details);
        },
        error: (message, { error, ...details }) => {
          log.error(message, { ...details, error: serializeError(error) });
        },
      },
    })
  : inertExtensions;

/**
 * What is on disk, which config alone can't tell: an install carries a version,
 * and an opt-in that never finished installing carries nothing.
 */
export async function getInstalledExtensions() {
  const installedExtensions: InstalledExtensionState[] = [];

  for (const curatedExtension of curatedExtensions) {
    const installedExtension = await getInstalledExtension({
      installDir: INSTALL_DIR,
      extensionId: curatedExtension.id,
    });

    if (installedExtension) {
      installedExtensions.push({ id: curatedExtension.id, version: installedExtension.version });
    }
  }

  return installedExtensions;
}

/**
 * The install in flight per extension, which a second call joins rather than
 * starting its own. Two installs of one extension — the user toggling it on
 * while the updater is checking it — unpack into the same staging directory,
 * where their writes tread on each other and one of the two renames fails.
 */
const runningInstalls = new Map<string, Promise<LatestExtensionInstall>>();

function installLatestCuratedExtension(extensionId: string) {
  let runningInstall = runningInstalls.get(extensionId);

  if (!runningInstall) {
    runningInstall = installLatestExtension({
      extensionId,
      installDir: INSTALL_DIR,
      chromeVersion: process.versions.chrome,
    }).finally(() => {
      runningInstalls.delete(extensionId);
    });

    runningInstalls.set(extensionId, runningInstall);
  }

  return runningInstall;
}

/** Installs the latest version and records the opt-in, which is what loads it. */
export async function installCuratedExtension(extensionId: string) {
  const { version } = await installLatestCuratedExtension(extensionId);

  const installedExtensionIds = config.get("extensions.installed");

  if (!installedExtensionIds.includes(extensionId)) {
    config.set("extensions.installed", [...installedExtensionIds, extensionId]);
  }

  log.info("Installed extension", { extensionId, version });
}

export async function uninstallCuratedExtension(extensionId: string) {
  config.set(
    "extensions.installed",
    config
      .get("extensions.installed")
      .filter((installedExtensionId) => installedExtensionId !== extensionId),
  );

  await uninstallExtension({ installDir: INSTALL_DIR, extensionId });

  log.info("Uninstalled extension", { extensionId });
}

/**
 * The version directories an update replaced, and the staging directories a
 * crashed install left behind. Runs before the first session is set up, since
 * that is where deriving reads an install directory from.
 */
export async function pruneInstalledExtensionVersions() {
  // Launch awaits both prunes before the first session, without asking whether
  // extensions exist — so unlike the rest of this module, which is reached only
  // through call sites that are themselves compiled out, these two answer for
  // themselves
  if (!EXTENSIONS_ENABLED) {
    return;
  }

  try {
    await pruneExtensionVersions({ installDir: INSTALL_DIR });
  } catch (error) {
    log.error("Failed to prune installed extension versions", { error: serializeError(error) });
  }
}

/**
 * The copies the loader derived from extensions that are no longer loaded — an
 * extension the user opted out of, a version an update replaced — are the
 * embedder's to collect. Once per launch, before the sessions derive: a copy is
 * unaccounted for the moment a derive drops its stamp to write it again.
 */
export async function pruneDerivedExtensionCopies() {
  if (!EXTENSIONS_ENABLED) {
    return;
  }

  try {
    await pruneDerivedExtensions({
      derivedExtensionsDir: DERIVED_EXTENSIONS_DIR,
      keptSourceDirs: await getExtensionDirs(),
    });
  } catch (error) {
    log.error("Failed to prune derived extensions", { error: serializeError(error) });
  }
}

/**
 * Keeps the installed extensions at the version the update endpoint serves. A
 * new version is loaded on the next launch, since sessions keep the copy they
 * derived for as long as they live.
 */
class ExtensionUpdater {
  /** The check in flight, which a second trigger joins instead of downloading again. */
  private runningCheck: Promise<ExtensionUpdateResult[]> | undefined;

  init() {
    if (!licenseKey.isValid) {
      return;
    }

    // The interval stands even when nothing is installed yet, and every check
    // re-reads the opt-ins, so an extension installed mid-session is kept up to
    // date without a restart
    if (config.get("extensions.installed").length > 0) {
      this.checkForUpdates();
    }

    setInterval(() => {
      this.checkForUpdates();
    }, ms("3h"));
  }

  checkForUpdates() {
    if (!this.runningCheck) {
      this.runningCheck = this.updateOptedInExtensions().finally(() => {
        this.runningCheck = undefined;
      });
    }

    return this.runningCheck;
  }

  private async updateOptedInExtensions() {
    const results: ExtensionUpdateResult[] = [];

    for (const extensionId of getOptedInExtensionIds()) {
      try {
        const { updated, version } = await installLatestCuratedExtension(extensionId);

        log.info(updated ? "Updated extension" : "Extension is up to date", {
          extensionId,
          version,
        });

        results.push(
          updated
            ? { id: extensionId, status: "updated", version }
            : { id: extensionId, status: "upToDate" },
        );
      } catch (error) {
        log.error("Failed to update extension", { extensionId, error: serializeError(error) });

        results.push({
          id: extensionId,
          status: "failed",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }
}

/** What `ipc.ts` and launch call the updater through, inert without extensions. */
type AppExtensionUpdater = Pick<ExtensionUpdater, "init" | "checkForUpdates">;

const inertExtensionUpdater: AppExtensionUpdater = {
  init: () => {},
  checkForUpdates: async () => [],
};

export const extensionUpdater: AppExtensionUpdater = EXTENSIONS_ENABLED
  ? new ExtensionUpdater()
  : inertExtensionUpdater;
