import path from "node:path";
import { is } from "@electron-toolkit/utils";
import {
  createSharedExtensionInstance,
  type ExtensionWindow,
  type ExtensionWindowOpenDetails,
  Extensions,
  findExtensionDirs,
  getInstalledExtension,
  installLatestExtension,
  isExtensionId,
  type LatestExtensionInstall,
  pruneDerivedExtensions,
  pruneExtensionVersions,
  registerExtensionBridgeScheme,
  uninstallExtension,
} from "@meru/electron-extensions";
import {
  FIXTURE_DECLARED_CONTENT_SCRIPTS,
  FIXTURE_LOCAL_STORAGE_DEFAULTS,
  FIXTURE_WINDOW_CLOSE_FALLBACK_REJECTION,
} from "@meru/electron-extensions/fixture/catalog";
import { FIXTURE_EXTENSION_ID } from "@meru/electron-extensions/fixture/id";
import {
  curatedExtensions,
  getSkippedPasswordManagerIds,
  hostnameToMatchPattern,
  isCuratedExtensionId,
} from "@meru/shared/extensions";
import { ms } from "@meru/shared/ms";
import { GMAIL_TAB_ID } from "@meru/shared/tabs";
import type { ExtensionUpdateResult, InstalledExtensionState } from "@meru/shared/types";
import { app, session, type WebContents, webContents } from "electron";
import { serializeError } from "serialize-error";
import { accounts } from "@/accounts";
import { config } from "@/config";
import {
  installExtensionReplacingConflicts,
  normalizeInstalledPasswordManagers,
} from "@/lib/extension-swap";
import type { ExtensionWindowOutcome } from "@/lib/extension-window";
import { loadUrl } from "@/lib/load-url";
import { log } from "@/lib/log";
import { serializeErrorDetails } from "@/lib/log-details";
import {
  createBrowserWindow,
  getBackgroundColor,
  isWindowVisibleOnConnectedDisplay,
} from "@/lib/window";
import { licenseKey } from "@/license-key";
import { openExternalUrl } from "@/url";
import { WorkspaceApp } from "@/workspace-app";

/** Where the curated extensions are installed, `<installDir>/<id>/<version>`. */
const INSTALL_DIR = path.join(app.getPath("userData"), "extensions");

const DERIVED_EXTENSIONS_DIR = path.join(app.getPath("userData"), "derived-extensions");

/** Where an extension's granted optional permissions are kept, by its id. */
const GRANTED_PERMISSIONS_PATH = path.join(app.getPath("userData"), "extension-permissions.json");

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
 * The optional permissions `chrome.permissions.request` may grant an extension:
 * the catalog's own list for a curated extension, and `nativeMessaging` for the
 * fixture, which is what the end-to-end suite grants and relaunches on. The
 * fixture's is behind the condition that loads it at all, so a shipped build
 * grants it nothing.
 *
 * Everything else is answered the way Chrome answers a prompt the user
 * declined, the catalog being the only place a grant can come from.
 */
function getGrantableOptionalPermissions(extensionId: string) {
  if (extensionId === FIXTURE_EXTENSION_ID) {
    return getFixtureExtensionDirs().length > 0 ? ["nativeMessaging"] : [];
  }

  return curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
    ?.grantableOptionalPermissions;
}

/**
 * Whether an extension's worker gets `storage.onChanged` synthesized: the
 * catalog's flag for a curated extension, and always for the fixture, whose
 * end-to-end suite checks the change events across sessions.
 */
function synthesizesStorageChanges(extensionId: string) {
  if (extensionId === FIXTURE_EXTENSION_ID) {
    return getFixtureExtensionDirs().length > 0;
  }

  return (
    curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
      ?.synthesizeStorageChanges === true
  );
}

/**
 * The scripts an extension's account-session copies declare on top of its own
 * content scripts: the catalog's list for a curated extension, and the
 * fixture's for the fixture, behind the condition that loads it at all.
 */
function getDeclaredContentScripts(extensionId: string) {
  if (extensionId === FIXTURE_EXTENSION_ID) {
    return getFixtureExtensionDirs().length > 0 ? FIXTURE_DECLARED_CONTENT_SCRIPTS : undefined;
  }

  return curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
    ?.declaredContentScripts;
}

/**
 * What an extension's `chrome.storage.local` starts with: the catalog's values
 * for a curated extension, and one key for the fixture, whose end-to-end suite
 * reads it back, behind the condition that loads it at all.
 */
function getLocalStorageDefaults(extensionId: string) {
  if (extensionId === FIXTURE_EXTENSION_ID) {
    return getFixtureExtensionDirs().length > 0 ? FIXTURE_LOCAL_STORAGE_DEFAULTS : undefined;
  }

  return curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
    ?.localStorageDefaults;
}

/**
 * Which replies are turned into a rejection when the user closed a window
 * opened for the request: the catalog's rule for a curated extension, and the
 * fixture's for the fixture, behind the condition that loads it at all.
 */
function getWindowCloseFallbackRejection(extensionId: string) {
  if (extensionId === FIXTURE_EXTENSION_ID) {
    return getFixtureExtensionDirs().length > 0
      ? FIXTURE_WINDOW_CLOSE_FALLBACK_REJECTION
      : undefined;
  }

  return curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
    ?.rejectFallbackOnWindowClose;
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

/** Logged once per launch, though the opt-ins are read again for every session. */
const loggedSkippedExtensionIds = new Set<string>();

/**
 * The curated extensions the user opted into, and Pro is what they run on. A
 * second password manager is left out, the same one the launch's
 * `uninstallReplacedPasswordManagers` uninstalls, so the two agree when that
 * uninstall fails.
 */
function getOptedInExtensionIds() {
  if (!config.get("extensions.enabled") || !licenseKey.isValid) {
    return [];
  }

  const installedExtensionIds = config
    .get("extensions.installed")
    .filter((extensionId) => isCuratedExtensionId(extensionId));

  const skippedExtensionIds = getSkippedPasswordManagerIds(installedExtensionIds);

  for (const extensionId of skippedExtensionIds) {
    if (!loggedSkippedExtensionIds.has(extensionId)) {
      loggedSkippedExtensionIds.add(extensionId);

      log.warn("Skipped loading a second password manager", { extensionId });
    }
  }

  return installedExtensionIds.filter((extensionId) => !skippedExtensionIds.includes(extensionId));
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
 * Where a curated extension's content scripts may run: the catalog entry it is
 * offered under, plus the sites the user added for it. An extension the catalog
 * says nothing about — a development folder — runs its content scripts as its
 * author declared them, and additional sites never start clamping one.
 *
 * Read per call rather than through a listener, because the derive reads the
 * applied list while a session is set up and stamps it into the copy, so a
 * change lands on the next launch like every other extension change.
 */
function getContentScriptMatches(extensionId: string) {
  const contentScriptMatches = curatedExtensions.find(
    (curatedExtension) => curatedExtension.id === extensionId,
  )?.contentScriptMatches;

  if (!contentScriptMatches) {
    return;
  }

  const additionalSites = config.get("extensions.additionalSites")[extensionId] ?? [];

  return [...contentScriptMatches, ...additionalSites.map(hostnameToMatchPattern)];
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

/**
 * Which extensions `chrome.windows.create` opens a window for: the catalog
 * entry says so per extension, and the fixture is opted in wherever it is
 * loaded, which is how the end-to-end suite drives the namespace. Behind the
 * condition that loads the fixture at all, so a shipped build opens windows
 * only for what the catalog named.
 */
function canOpenExtensionWindows(extensionId: string) {
  if (extensionId === FIXTURE_EXTENSION_ID) {
    return getFixtureExtensionDirs().length > 0;
  }

  return (
    curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
      ?.opensExtensionWindows === true
  );
}

/**
 * Which extensions hear the `webNavigation` events main synthesizes: the
 * catalog entry says so per extension, and the fixture wherever it is loaded,
 * whose end-to-end suite checks them.
 */
function deliversNavigationEvents(extensionId: string) {
  if (extensionId === FIXTURE_EXTENSION_ID) {
    return getFixtureExtensionDirs().length > 0;
  }

  return (
    curatedExtensions.find((curatedExtension) => curatedExtension.id === extensionId)
      ?.deliversNavigationEvents === true
  );
}

/**
 * What a popout gets when the extension names no size. Bitwarden's own popout
 * dimensions, which is what its unlock window asks for anyway — this is for the
 * call that leaves them out, where a window at Electron's 800x600 default would
 * be a popup page in the corner of an empty window.
 */
const EXTENSION_WINDOW_SIZE = { width: 380, height: 630 };

/** Only a browser's to open, which is anything that is not an extension page. */
function openExtensionWindowUrlExternally(url: string) {
  if (url.startsWith("https://") || url.startsWith("http://")) {
    openExternalUrl(url);
  }
}

function isExtensionPageUrl(extensionId: string, url: string) {
  const pageUrl = URL.parse(url);

  // `URL.origin` is `"null"` for every scheme the URL standard doesn't call
  // special, `chrome-extension:` among them
  return pageUrl?.protocol === "chrome-extension:" && pageUrl.host === extensionId;
}

/**
 * A `chrome.windows.create` window: one page of the extension, in the default
 * session, where the full copy and its worker are. Meru draws nothing on it —
 * the extension's own page is the whole window, and a titlebar would be Meru's
 * to position over a page it knows nothing about — and no preload is attached,
 * the facade already being in the copy the page is loaded from.
 *
 * `useContentSize`, because the size an extension asks for is the size its
 * popout was laid out at, which a window frame would otherwise eat into.
 *
 * The window stays on the extension it was opened for: a page it navigates to
 * or opens is the user's browser's, since nothing here is an account's view and
 * none of the handling one carries — the request blocking, the permission
 * handler, the user agent — applies to it.
 */
function openExtensionWindow({
  extensionId,
  url,
  width,
  height,
  left,
  top,
}: ExtensionWindowOpenDetails): ExtensionWindow {
  const size = {
    width: width ?? EXTENSION_WINDOW_SIZE.width,
    height: height ?? EXTENSION_WINDOW_SIZE.height,
  };

  const window = createBrowserWindow({
    ...size,
    // Where the extension asked for, as long as the user can see it: a popout
    // placed against a display since unplugged would open offscreen, with
    // nothing on screen to drag it back by
    ...(left !== undefined &&
    top !== undefined &&
    isWindowVisibleOnConnectedDisplay({ x: left, y: top, ...size })
      ? { x: left, y: top }
      : {}),
    useContentSize: true,
    autoHideMenuBar: true,
    backgroundColor: getBackgroundColor(),
    webPreferences: { session: session.defaultSession },
  });

  loadUrl(window.webContents, url);

  window.webContents.setWindowOpenHandler(({ url: openedUrl }) => {
    openExtensionWindowUrlExternally(openedUrl);

    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, navigationUrl) => {
    if (isExtensionPageUrl(extensionId, navigationUrl)) {
      return;
    }

    event.preventDefault();

    openExtensionWindowUrlExternally(navigationUrl);
  });

  return {
    // `focus` alone leaves a minimized window minimized on macOS and Windows,
    // so a second Unlock would look like it did nothing
    focus: () => {
      if (window.isMinimized()) {
        window.restore();
      }

      window.show();

      window.focus();
    },
    close: () => {
      window.close();
    },
    isDestroyed: () => window.isDestroyed(),
    isFocused: () => window.isFocused(),
    getBounds: () => window.getBounds(),
    containsFrame: (frame) =>
      !window.isDestroyed() && webContents.fromFrame(frame) === window.webContents,
    onClosed: (listener) => {
      window.once("closed", listener);
    },
  };
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
  synthesizesStorageChanges,
  getDeclaredContentScripts,
  getLocalStorageDefaults,
  getGrantableOptionalPermissions,
  grantedPermissionsPath: GRANTED_PERMISSIONS_PATH,
  canOpenExtensionWindows,
  openExtensionWindow,
  deliversNavigationEvents,
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
  // What the block above leaves behind: 1Password re-arms its log-metrics
  // flush every thirty seconds however the last one went, and each canceled
  // flush writes an error line the worker console forwarder would otherwise
  // put in the shipped log twice a minute. Demoted rather than dropped, so
  // development still sees the only trace there is of what the worker is
  // doing, and read off the same catalog entries as the blocked hosts, so the
  // line and the cancel that causes it stay in one place.
  benignWorkerConsoleErrors: curatedExtensions.flatMap(
    (curatedExtension) => curatedExtension.benignWorkerConsoleErrors ?? [],
  ),
  sharedInstance: createSharedExtensionInstance({
    shimScriptPath: path.join(__dirname, "extensions-runtime-proxy-shim.js"),
    relayScriptPath: path.join(__dirname, "extensions-runtime-proxy-relay.js"),
    getWorkerSession: () => session.defaultSession,
    isActiveTab,
    activateTab,
    getWindowCloseFallbackRejection,
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
 * Makes a page the one its window shows, for an extension's `tabs.update(tabId,
 * {active: true})`, which the loader asks for only when `isActiveTab` says it
 * isn't: its account and its tab within the account are selected. The window
 * is neither shown nor focused, since Chrome's `active` never touches window
 * focus. Bitwarden asks for it each time a popout finishes, by which time the
 * user may be in another app, or have Meru hidden in the tray. A workspace app
 * in a window of its own never gets here, since `isActiveTab` answers true for
 * it, and a page no account shows as a tab is left where it is.
 */
function activateTab(contents: WebContents) {
  const workspaceApp = WorkspaceApp.tryFromViewWebContents(contents);

  const account = workspaceApp
    ? accounts.instances.get(workspaceApp.accountId)
    : accounts.findInstanceByGmailWebContentsId(contents.id);

  if (!account) {
    return;
  }

  account.tabs.activateTab(workspaceApp?.id ?? GMAIL_TAB_ID);

  accounts.selectAccount(account.accountId);
}

/**
 * What an extension page may be granted, in any session: copying a password
 * and posting a notification are what a curated extension has business asking
 * for. Anything else, the microphone and camera above all, is refused, since
 * manifest permissions don't gate these requests.
 */
export const EXTENSION_PAGE_PERMISSIONS = new Set([
  "clipboard-read",
  "clipboard-sanitized-write",
  "notifications",
]);

/**
 * The allowlist for an extension page of the worker's session, which is a
 * window `chrome.windows.create` opened — where Bitwarden's master password is
 * typed — under the same rule as the same page in an account session.
 * Everything else there, Meru's own renderer, keeps Electron's default of
 * granting, which is what it had with no handler at all.
 */
function registerWorkerSessionPermissionHandlers() {
  const workerSession = session.defaultSession;

  workerSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    callback(
      !extensions.isLoadedExtensionUrl(workerSession, details.requestingUrl) ||
        EXTENSION_PAGE_PERMISSIONS.has(permission),
    );
  });

  workerSession.setPermissionCheckHandler(
    (_webContents, permission, requestingOrigin) =>
      !extensions.isLoadedExtensionUrl(workerSession, requestingOrigin) ||
      EXTENSION_PAGE_PERMISSIONS.has(permission),
  );
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
  registerWorkerSessionPermissionHandlers();

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
 * Opens the page the catalog names for a curated extension's settings item —
 * Bitwarden's popup, where it signs in — in a window of the worker's session.
 * Only once the extension is loaded there, which an install is not until the
 * restart after it.
 */
export function openCuratedExtensionWindow(extensionId: string): ExtensionWindowOutcome {
  if (!extensions.isExtensionLoaded(session.defaultSession, extensionId)) {
    return "notLoaded";
  }

  const windowPagePath = curatedExtensions.find(
    (curatedExtension) => curatedExtension.id === extensionId,
  )?.windowPagePath;

  return windowPagePath !== undefined && extensions.openExtensionWindow(extensionId, windowPagePath)
    ? "opened"
    : "refused";
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

/**
 * Stands in for the Chrome Web Store download in the end-to-end suite, which
 * has no package signed for a curated id and so can't install one any other
 * way. It writes nothing, so the opt-in it leads to loads nothing either.
 * Behind the flag alone rather than the fixture's development default, so a
 * development run still downloads what it installs.
 */
async function downloadCuratedExtension(extensionId: string) {
  if (isFixtureExtensionEnabled()) {
    return { version: "fixture" };
  }

  return installLatestCuratedExtension(extensionId);
}

/**
 * The install in flight, which the next one waits for. Each reads the opt-ins
 * after its download to find what it turns off, and two reading them at once
 * would each miss the other.
 */
let runningOptIn: Promise<unknown> = Promise.resolve();

/**
 * Installs the latest version and records the opt-in, which is what loads it,
 * turning off an installed extension it can't run beside.
 */
export function installCuratedExtension(extensionId: string) {
  const optIn = runningOptIn
    .catch(() => {})
    .then(async () => {
      let version: string | undefined;

      await installExtensionReplacingConflicts(extensionId, {
        download: async () => {
          ({ version } = await downloadCuratedExtension(extensionId));
        },
        getInstalledExtensionIds: () => config.get("extensions.installed"),
        uninstall: uninstallCuratedExtension,
        recordOptIn: () => {
          const installedExtensionIds = config.get("extensions.installed");

          if (!installedExtensionIds.includes(extensionId)) {
            config.set("extensions.installed", [...installedExtensionIds, extensionId]);
          }
        },
      });

      log.info("Installed extension", { extensionId, version });
    });

  runningOptIn = optIn;

  return optIn;
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
   * Only this extension's store goes, since every curated extension keeps its
   * sign-in in the same session.
   */
  extensions.unloadExtension(session.defaultSession, extensionId);

  await extensions.clearExtensionData(session.defaultSession, extensionId);

  // And what the user allowed it, which Chrome drops with the install, so a
  // reinstall asks again rather than coming back already granted
  await extensions.clearGrantedPermissions(extensionId);

  log.info("Uninstalled extension", { extensionId });
}

/**
 * Removes every opt-in this build's catalog doesn't offer, with its package,
 * its store in the worker session and its permission grants. Such an id comes from another channel: a
 * Beta catalog offers extensions stable doesn't, and leaving Beta installs
 * stable over it. The loader already skips the id, but the opt-in would keep
 * its package from being pruned and the Update extensions button showing.
 *
 * Runs whatever the master switch and the license say, since it is cleanup,
 * and before the prunes and the worker session load, so nothing holds the
 * store open. Only the curated install writes `extensions.installed`, so the
 * development folder and the fixture extension are never in it.
 *
 * A malformed id keeps its package and store, because the id becomes a path
 * segment in those deletes.
 */
export async function removeUncataloguedExtensions() {
  const installedExtensionIds = config.get("extensions.installed");

  const uncataloguedExtensionIds = installedExtensionIds.filter(
    (extensionId) => !isCuratedExtensionId(extensionId),
  );

  if (uncataloguedExtensionIds.length === 0) {
    return;
  }

  config.set("extensions.installed", installedExtensionIds.filter(isCuratedExtensionId));

  const additionalSites = { ...config.get("extensions.additionalSites") };

  for (const extensionId of uncataloguedExtensionIds) {
    delete additionalSites[extensionId];
  }

  config.set("extensions.additionalSites", additionalSites);

  for (const extensionId of uncataloguedExtensionIds) {
    try {
      if (isExtensionId(extensionId)) {
        await uninstallExtension({ installDir: INSTALL_DIR, extensionId });

        await extensions.clearExtensionData(session.defaultSession, extensionId);
      }

      await extensions.clearGrantedPermissions(extensionId);

      log.info("Removed extension this version doesn't offer", { extensionId });
    } catch (error) {
      log.error("Failed to remove extension this version doesn't offer", {
        extensionId,
        error: serializeError(error),
      });
    }
  }
}

/**
 * A version of Meru without the one-at-a-time rule, sharing this profile, can
 * have installed a second password manager. Whatever the master switch and the
 * license say, since this is cleanup rather than loading. After the app is
 * ready, since the uninstall clears storage in the default session, and before
 * the prunes and the first load.
 */
export async function uninstallReplacedPasswordManagers() {
  await normalizeInstalledPasswordManagers({
    getInstalledExtensionIds: () => config.get("extensions.installed"),
    uninstall: uninstallCuratedExtension,
    log,
  });
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
