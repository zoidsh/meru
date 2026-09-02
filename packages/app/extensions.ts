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
import { curatedExtensions, isCuratedExtensionId } from "@meru/shared/extensions";
import { ms } from "@meru/shared/ms";
import type { ExtensionUpdateResult, InstalledExtensionState } from "@meru/shared/types";
import { app, session } from "electron";
import { serializeError } from "serialize-error";
import { config } from "@/config";
import { log } from "@/lib/log";
import { serializeErrorDetails } from "@/lib/log-details";
import { licenseKey } from "@/license-key";

/** Where the curated extensions are installed, `<installDir>/<id>/<version>`. */
const INSTALL_DIR = path.join(app.getPath("userData"), "extensions");

const DERIVED_EXTENSIONS_DIR = path.join(app.getPath("userData"), "derived-extensions");

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
  if (!config.get("extensions.enabled") || !licenseKey.isValid) {
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
 *
 * The master switch is checked here rather than only on the opt-ins, so that
 * off means nothing loads at all — the development and fixture folders
 * included, which no opt-in covers.
 */
async function getExtensionDirs() {
  if (!config.get("extensions.enabled")) {
    return [];
  }

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

// Extension contexts reach the main process over the bridge's custom scheme,
// and Electron only takes scheme privileges while modules are still loading
registerExtensionBridgeScheme();

export const extensions = new Extensions({
  extensionDirs: getExtensionDirs,
  facadeScriptPath: path.join(__dirname, "extensions-chrome-facade.js"),
  derivedExtensionsDir: DERIVED_EXTENSIONS_DIR,
  strippedManifestKeys: getStrippedManifestKeys(),
  getContentScriptMatches,
  // One shared extension instance across every session — one 1Password sign-in
  // instead of one per account, and one worker whatever the account count. It
  // is how Meru runs extensions rather than something the user chooses: a
  // per-account instance is the thing the feature exists to remove, so an off
  // switch would only ever switch back to the worse sign-in and memory
  // behavior, and `extensions.enabled` already turns extensions off entirely.
  // Passed unconditionally rather than behind that master switch, which is read
  // per session in `getExtensionDirs`: a session that loads no extension never
  // adopts a role, so gating here would buy nothing and would read the switch
  // once at launch. Deleting this one option still removes the whole feature.
  //
  // The worker lives in the default session, which no account owns, so an
  // account session is never the one holding it — see
  // `setupExtensionsWorkerSession` below.
  sharedInstance: createSharedExtensionInstance({
    shimScriptPath: path.join(__dirname, "extensions-runtime-proxy-shim.js"),
    relayScriptPath: path.join(__dirname, "extensions-runtime-proxy-relay.js"),
    getWorkerSession: () => session.defaultSession,
  }),
  logger: {
    info: (message, details) => {
      log.info(message, details);
    },
    error: (message, details) => {
      log.error(message, serializeErrorDetails(details));
    },
  },
});

/**
 * Loads the extensions into the session the one worker runs in, which is
 * Electron's default session: no account owns it, so removing an account is a
 * non-event for the worker and the one 1Password sign-in outlives every
 * removal, and every account session is content-script-only from its first
 * load rather than whichever came first keeping the whole extension.
 *
 * Called before `accounts.init()` constructs any account session, and awaited
 * by nothing: role adoption no longer turns on the order sessions are set up,
 * so what starting first buys is only that the worker is loading while the
 * accounts come up rather than after them. The load is reported the way an
 * account's is, since a worker that failed to load must not take the launch
 * with it — the accounts' copies are still there, reaching a worker that will
 * not answer.
 *
 * The store the worker keeps lands in `userData` itself, that being what
 * `getStoragePath()` answers for the default session where an account's
 * answers `userData/Partitions/<accountId>` — every directory name
 * `clearSessionData` already looks for, at a root that carries nothing else of
 * the kind.
 */
export function setupExtensionsWorkerSession() {
  extensions.setupSession(session.defaultSession).catch((error: unknown) => {
    log.error("Failed to set up extensions worker session", { error: serializeError(error) });
  });
}

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
  // An install of the same id in flight is writing into the very directories
  // this is about to drop: the delete would pull the staging directory out from
  // under it, and a rename landing after the delete would put a version back
  // with no opt-in to account for it. Its outcome is the install's to report,
  // so a failure here is only a reason to stop waiting.
  await runningInstalls.get(extensionId)?.catch(() => {});

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
 * The version directories an update replaced, the staging directories a crashed
 * install left behind, and the installs no opt-in accounts for. Runs before the
 * first session is set up, since that is where deriving reads an install
 * directory from.
 *
 * What is kept is what the user opted into rather than what loads: an extension
 * whose load the master switch or a lapsed license is holding back is one the
 * user still owns, and turning the switch back on must not mean downloading it
 * again.
 */
export async function pruneInstalledExtensionVersions() {
  try {
    await pruneExtensionVersions({
      installDir: INSTALL_DIR,
      keptExtensionIds: config.get("extensions.installed"),
    });
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

    // The interval stands even when nothing is installed yet and even when the
    // master switch is off, and every check re-reads both, so an extension
    // installed mid-session is kept up to date without a restart
    if (config.get("extensions.enabled") && config.get("extensions.installed").length > 0) {
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

export const extensionUpdater = new ExtensionUpdater();
