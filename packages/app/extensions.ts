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
import { app, session, type WebContents } from "electron";
import { serializeError } from "serialize-error";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { log } from "@/lib/log";
import { serializeErrorDetails } from "@/lib/log-details";
import { licenseKey } from "@/license-key";
import { WorkspaceApp } from "@/workspace-app";

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

/**
 * Meru's own pages in the worker session, as match patterns, for the loader to
 * warn about an extension whose content scripts reach them. The renderer, the
 * bookmarks and downloads popups and the desktop-sources page are all one
 * origin, which `loadRenderer` decides: a `file://` document in a packaged
 * build, unmatchable while the loader grants no file access, and the dev
 * server in development — which is where an unpacked `extensions/` folder is
 * loaded from, so it is the one that can actually be reached.
 *
 * The port is left off because Chrome's grammar has no place for one: a
 * pattern carrying a port is not a narrower pattern but an invalid one, which
 * Chromium refuses as it loads the manifest.
 *
 * A `MERU_RENDERER_URL` that will not parse gives no patterns rather than
 * throwing. It is read at module scope, where a throw would take the launch
 * with it, and `loadRenderer` hands the same value to `loadUrl`, so a bad one
 * is already a page that does not load — the warning going quiet is the
 * smaller half of that.
 */
function getWorkerSessionPagePatterns() {
  if (!is.dev) {
    return ["file:///*"];
  }

  try {
    const { protocol, hostname } = new URL(
      process.env.MERU_RENDERER_URL || "http://localhost:3000/",
    );

    return [`${protocol}//${hostname}/*`];
  } catch {
    return [];
  }
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
  workerSessionPagePatterns: getWorkerSessionPagePatterns(),
  // The worker's own requests never reach `blocker`, which attaches per account
  // session, so the worker session is the only place a privacy block on them
  // can go. Unconditional rather than behind `blocker.enabled` or the license:
  // none of this traffic is anything the user asked for, extensions are Pro
  // already, and a curated extension that names no telemetry hosts contributes
  // nothing here.
  workerSessionBlockedUrls: curatedExtensions.flatMap(
    (curatedExtension) => curatedExtension.telemetryUrls ?? [],
  ),
  sharedInstance: createSharedExtensionInstance({
    shimScriptPath: path.join(__dirname, "extensions-runtime-proxy-shim.js"),
    relayScriptPath: path.join(__dirname, "extensions-runtime-proxy-relay.js"),
    getWorkerSession: () => session.defaultSession,
    isActiveTab,
  }),
  logger: {
    debug: (message, details) => {
      log.debug(message, details);
    },
    info: (message, details) => {
      log.info(message, details);
    },
    error: (message, details) => {
      log.error(message, serializeErrorDetails(details));
    },
  },
});

/**
 * Which page Meru is showing, which is what Chrome's `tabs.Tab.active` means
 * and what the one worker's `chrome.tabs.query({active: true})` asks for. The
 * selected account's front view is the answer in the main window — the same
 * derivation the menu's `getActiveViewWebContents` uses — and a workspace app
 * living in a window of its own is the page that window shows.
 *
 * Focus is deliberately not the question, though it is what Electron's own
 * `tabs` answers: 1Password unlocks behind a Touch ID prompt raised by its
 * desktop app, so at the moment its worker asks for the active tab none of
 * Meru's views is focused at all, and a focus-based answer would send the
 * unlock to nobody.
 *
 * `accounts` and `WorkspaceApp` both import this module, so the imports back
 * close a cycle. It holds because nothing here is dereferenced while the
 * modules evaluate: this is a hoisted function declaration, and the first call
 * to it is a query from the worker, which is many awaits past the last module
 * body. The guards are for the other end of the same window — an app whose
 * accounts have not been constructed yet has no front view to name — and for
 * the moments an account is half removed.
 */
function isActiveTab(contents: WebContents) {
  const workspaceApp = WorkspaceApp.tryFromViewWebContents(contents);

  if (workspaceApp?.isWindowed) {
    return true;
  }

  if (accounts.instances.size === 0) {
    return false;
  }

  // Resolving the front view throws while an account is being removed: its
  // tabs are closed and its Gmail view destroyed several awaits before the
  // config stops naming it as selected. A page with no front view to name is
  // not active, and saying so keeps the rest of the answer standing — a throw
  // here would fail the whole query, and a lock broadcast landing in that
  // window would reach nobody
  try {
    const selectedAccount = accounts.getSelectedAccount();

    const activeView =
      selectedAccount.instance.tabs.activeTab.view ?? selectedAccount.instance.gmail.view;

    return activeView.webContents === contents;
  } catch {
    return false;
  }
}

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

  /*
   * And what the extension wrote, which lives in the default session with the
   * worker. Removing an account used to clear that account's copy of the
   * store, so uninstalling and then removing every account left nothing
   * behind; with one store in a session no removal touches, nothing but a full
   * app reset would reach it and a reinstall would come back signed in. Chrome
   * deletes an extension's storage on uninstall too, with nothing further
   * asked.
   *
   * Unloaded from the worker session first, because the delete has to land on
   * a store nothing is writing: the copy otherwise stays loaded until the
   * restart the settings page asks for, and a worker still running writes part
   * of its store back behind the delete — into the directory a reinstall under
   * the same id reads, so the reinstall comes back signed in, which is the one
   * outcome this call exists to prevent.
   *
   * How much of the Windows half it fixes is reasoned rather than measured:
   * `removeExtension` terminates the worker asynchronously and says nothing
   * about closing the LevelDB handle, so a delete failing against files
   * Chromium still holds open stays possible there, which is what
   * `clearSessionData` retries for.
   *
   * The accounts' content-script-only copies are left where they are. They
   * hold no store, and unloading them would only take away the content scripts
   * of documents already open, which the restart does anyway.
   *
   * It clears every extension's store in that session rather than this one's,
   * which is exact while the catalog holds a single entry and is why a second
   * curated extension needs a per-id clear before it lands.
   */
  extensions.unloadExtension(session.defaultSession, extensionId);

  await extensions.clearSessionData(session.defaultSession);

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
