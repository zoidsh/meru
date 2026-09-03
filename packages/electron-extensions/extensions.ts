import fs from "node:fs/promises";
import path from "node:path";
import type { Event as ElectronEvent, Extension, MessageDetails, Session } from "electron";
import {
  type ActionExtension,
  createExtensionAction,
  type ExtensionAction,
  readExtensionActionIcon,
} from "./action";
import { Alarms, type AlarmWakePolicy } from "./alarms/alarms";
import { ExtensionBridge } from "./bridge/bridge";
import { deriveExtension, type SharedInstanceDeriveOptions } from "./derive";
import { reachesClampedSite } from "./derive/match-pattern";
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

/** As much of an Electron `Extension` as the unclamped content script warning reads. */
type ContentScriptExtension = {
  id: string;
  name: string;
  manifest: { content_scripts?: { matches?: string[] }[] };
};

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
  /**
   * Whether a frame query from one session may resolve a tab of another, asked
   * only when the two differ. True for the one worker asking about a session
   * it shims and false for everything else: the worker runs in a session of
   * its own, so every tab it has business with is another session's, while a
   * shimmed session asking about another's tabs is one account reading
   * another's pages.
   */
  canResolveTabAcrossSessions(askingSession: Session, tabSession: Session): boolean;
  /**
   * Whether that session was the one holding the worker, which the loader logs
   * as the sessions left behind having nothing to reach. On an embedder that
   * names a session of its own and never tears it down, this answers false for
   * the life of the app — and it staying here is what makes that provable
   * rather than assumed, since a naming that ever broke would say so.
   */
  teardownSession(session: Session): boolean;
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
   * Which extensions a due alarm may start a stopped service worker for. Without
   * it an alarm reaches only the contexts already running, which is what Meru
   * ships: a worker woken every minute is a worker that never idles out.
   */
  shouldWakeWorkerForAlarm?: AlarmWakePolicy;
  /**
   * Lets one extension instance serve every session
   * (`createSharedExtensionInstance` in `runtime-proxy/`). Without it every
   * session runs its own.
   */
  sharedInstance?: SharedExtensionInstance;
  /**
   * The embedder's own pages in the worker session, as match patterns. The
   * worker session is the embedder's rather than a user's browsing, so an
   * extension whose content scripts reach a page there is running inside the
   * app's own UI, which is worth saying out loud. Without this nothing is
   * checked and nothing is said.
   */
  workerSessionPagePatterns?: string[];
  /**
   * Match patterns whose requests are canceled in the worker session, before
   * they leave the machine. An extension's service worker runs there rather
   * than in an account session, so whatever the embedder blocks per account
   * never sees a single request the worker makes, and this is the only place a
   * block on the worker's own traffic can go.
   *
   * The account sessions are deliberately left alone: a session takes exactly
   * one `onBeforeRequest` listener, and in an account session that one is the
   * embedder's. Nothing is attached without a shared instance — there being no
   * worker session to speak of — or with an empty list.
   */
  workerSessionBlockedUrls?: string[];
  /**
   * Service worker console errors to forward at debug rather than error, as
   * prefixes matched against the start of the message. An extension retrying
   * on a timer writes the same failure line forever, and one the embedder has
   * already accounted for — a request the embedder itself cancels, say — is
   * noise it would carry in every log it keeps.
   *
   * Demoted, never dropped: the worker's console is the only trace of what an
   * extension is doing, so the line has to stay readable in development.
   * Without this every worker error is forwarded at error.
   */
  benignWorkerConsoleErrors?: string[];
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

  private workerSessionPagePatterns: string[] | undefined;

  private workerSessionBlockedUrls: string[] | undefined;

  private benignWorkerConsoleErrors: string[] | undefined;

  private logger: ExtensionsLogger | undefined;

  private loadedExtensionIdsBySession = new Map<Session, Set<string>>();

  private pendingSessionSetups = 0;

  private loadedExtensionsToReport = new Map<
    string,
    { name: string; version: string; extensionDir: string; sessions: number }
  >();

  private actionsBySession = new Map<Session, ExtensionAction[]>();

  private actionsChangedListeners = new Set<ActionsChangedListener>();

  private derivedExtensions = new Map<string, ReturnType<typeof deriveExtension>>();

  private actionIconDataUrls = new Map<string, Promise<string | null>>();

  private bridge: ExtensionBridge;

  private nativeMessaging: NativeMessaging;

  private webNavigation: WebNavigation;

  private alarms: Alarms;

  private serviceWorkerConsoleListeners = new Map<
    Session,
    (event: ElectronEvent, messageDetails: MessageDetails) => void
  >();

  /** The sessions carrying the cancel listener, to clear it from again. */
  private blockedUrlSessions = new Set<Session>();

  constructor({
    extensionDirs,
    facadeScriptPath,
    derivedExtensionsDir,
    strippedManifestKeys,
    getContentScriptMatches,
    isNativeMessagingHostAllowed,
    shouldWakeWorkerForAlarm,
    sharedInstance,
    workerSessionPagePatterns,
    workerSessionBlockedUrls,
    benignWorkerConsoleErrors,
    logger,
  }: ExtensionsOptions) {
    this.extensionDirs = extensionDirs;

    this.facadeScriptPath = facadeScriptPath;

    this.derivedExtensionsDir = derivedExtensionsDir;

    this.strippedManifestKeys = strippedManifestKeys;

    this.getContentScriptMatches = getContentScriptMatches;

    this.sharedInstance = sharedInstance;

    this.workerSessionPagePatterns = workerSessionPagePatterns;

    this.workerSessionBlockedUrls = workerSessionBlockedUrls;

    this.benignWorkerConsoleErrors = benignWorkerConsoleErrors;

    this.logger = logger;

    this.bridge = new ExtensionBridge({ logger });

    this.nativeMessaging = new NativeMessaging({
      isHostAllowed: isNativeMessagingHostAllowed,
      logger,
    });

    this.nativeMessaging.registerRoutes(this.bridge);

    this.webNavigation = new WebNavigation({
      canResolveTabAcrossSessions: (askingSession, tabSession) =>
        this.sharedInstance?.canResolveTabAcrossSessions(askingSession, tabSession) === true,
    });

    this.webNavigation.registerRoutes(this.bridge);

    this.alarms = new Alarms({ shouldWakeWorker: shouldWakeWorkerForAlarm, logger });

    this.alarms.registerRoutes(this.bridge);

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

  /**
   * Loads into the session, and reports what loaded once the sessions asking
   * together have all finished — see `recordLoadedExtension`.
   */
  async setupSession(session: Session) {
    this.pendingSessionSetups += 1;

    try {
      await this.loadExtensionsIntoSession(session);
    } finally {
      this.pendingSessionSetups -= 1;

      if (this.pendingSessionSetups === 0) {
        this.reportLoadedExtensions();
      }
    }
  }

  private async loadExtensionsIntoSession(session: Session) {
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

    this.blockWorkerSessionUrls(session, sharedInstanceDerive);

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

        this.recordLoadedExtension(extension, extensionDir);

        this.warnAboutUnclampedWorkerContentScripts(extension, sharedInstanceDerive);
      } catch (error) {
        this.logger?.error("Failed to load extension", { extensionDir, error });
      }
    }

    this.emitActionsChanged(session);
  }

  /**
   * Held rather than logged, because the same extension loads into every
   * session and a line per session says the same thing once per account.
   *
   * The count is what a per-session line was worth: it says the extension
   * reached every session that asked, and a shortfall is visible without
   * counting repeated lines.
   */
  private recordLoadedExtension(extension: Extension, extensionDir: string) {
    const loadedExtension = this.loadedExtensionsToReport.get(extension.id);

    if (loadedExtension) {
      loadedExtension.sessions += 1;

      return;
    }

    this.loadedExtensionsToReport.set(extension.id, {
      name: extension.name,
      version: extension.version,
      extensionDir,
      sessions: 1,
    });
  }

  /**
   * One line per extension, once every session that was setting up alongside
   * the others has finished. At launch the embedder starts them all in the one
   * tick — the worker session and every account's — so they are all in flight
   * together and the count is the launch's; a session set up afterwards, an
   * account added while the app runs, is on its own and reports its own line,
   * that being a separate event rather than a repeat of the launch.
   */
  private reportLoadedExtensions() {
    for (const [id, { name, version, extensionDir, sessions }] of this.loadedExtensionsToReport) {
      this.logger?.info("Loaded extension", { id, name, version, sessions, extensionDir });
    }

    this.loadedExtensionsToReport.clear();
  }

  /**
   * Cancels the requests the embedder named, in the worker session and nowhere
   * else. An extension's service worker runs there rather than in an account
   * session, so it sits outside whatever the embedder blocks per account, and
   * this listener is the only thing standing between the worker and the
   * network.
   *
   * `onBeforeRequest` rather than the `onBeforeSendHeaders` the bridge takes:
   * a session holds exactly one listener per event, and the worker session is
   * the embedder's own, where nothing else wants this one. The account
   * sessions are left alone by the same arithmetic — there the one
   * `onBeforeRequest` is the embedder's own blocker.
   *
   * A cancel and nothing more: the request fails in about a millisecond with
   * `net::ERR_BLOCKED_BY_CLIENT`, before DNS, TCP or TLS, and the worker sees
   * the `TypeError` its own fetch would have seen from any other failure.
   * Answering it instead is not on offer — a `data:` redirect from here aborts
   * the request rather than resolving it — and would buy nothing anyway, since
   * an extension retrying on a timer retries whatever it is told.
   *
   * The filter does every bit of the matching, so the listener itself parses
   * no URL: a pattern the embedder got wrong is a pattern that matches
   * nothing, not a listener that decides.
   */
  private blockWorkerSessionUrls(
    session: Session,
    sharedInstanceDerive: SharedInstanceDeriveOptions | undefined,
  ) {
    if (sharedInstanceDerive?.role !== "worker" || !this.workerSessionBlockedUrls?.length) {
      return;
    }

    this.blockedUrlSessions.add(session);

    session.webRequest.onBeforeRequest(
      { urls: this.workerSessionBlockedUrls },
      (_details, callback) => {
        callback({ cancel: true });
      },
    );

    // Once, and with the patterns, so that the log says why those requests
    // fail rather than leaving the extension's own error line to be read as a
    // network fault. At `debug`, since a shipped log has nothing to do with a
    // block that never changes: the line is for whoever is testing that it is
    // armed, and the file transport keeps it out of a packaged run
    this.logger?.debug("Blocking extension telemetry in the worker session", {
      urls: this.workerSessionBlockedUrls,
    });
  }

  /**
   * The worker session belongs to the embedder rather than to a user's
   * browsing: whatever pages it holds are the app's own. So an extension whose
   * content scripts reach one of them is running inside the app's own UI,
   * which is worth saying out loud once — a curated extension cannot, its
   * content scripts being clamped to a host allowlist, but an extension the
   * clamp says nothing about injects wherever its author declared.
   *
   * Asked of the manifest Chromium loaded, which is the clamped one, so this
   * needs no separate question about whether the extension was clamped: an
   * entry that survived a clamp naming other hosts does not reach these pages,
   * and the clamp dropping every entry leaves nothing to ask about.
   *
   * Meru's pages here are the main window's renderer, the bookmarks and
   * downloads popups and the desktop-sources page, all one origin: a `file://`
   * document in a packaged build, unmatchable by
   * any pattern while the loader grants no file access, but the dev server
   * over `http://localhost:3000` in development, which is exactly where an
   * unpacked folder is loaded from. Checking the patterns rather than only the
   * role is what keeps this quiet for a development extension aimed somewhere
   * else — the checked-in fixture's loopback pages, say — so that the times it
   * does fire mean something.
   */
  private warnAboutUnclampedWorkerContentScripts(
    extension: ContentScriptExtension,
    sharedInstanceDerive: SharedInstanceDeriveOptions | undefined,
  ) {
    if (sharedInstanceDerive?.role !== "worker" || !this.workerSessionPagePatterns?.length) {
      return;
    }

    const contentScriptMatches = extension.manifest.content_scripts?.flatMap(
      (contentScript) => contentScript.matches ?? [],
    );

    const reachingMatches = contentScriptMatches?.filter((contentScriptMatch) =>
      this.workerSessionPagePatterns?.some((pagePattern) =>
        reachesClampedSite(contentScriptMatch, pagePattern),
      ),
    );

    if (!reachingMatches?.length) {
      return;
    }

    this.logger?.error("Extension content scripts run in the app's own pages", {
      id: extension.id,
      name: extension.name,
      matches: reachingMatches,
    });
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
   *
   * Everything below an error goes out at debug: it is the extension's own
   * chatter, a lock poll every fifteen seconds and feature-flag dumps of
   * several kilobytes in 1Password's case, which an embedder wants in
   * development and not on the disk of every shipped install. Errors stay at
   * error, since a worker's own report of a failure is the diagnostic the
   * forwarding exists for — except the ones the embedder named as benign,
   * which are the same line one level down.
   */
  private pipeServiceWorkerConsole(session: Session) {
    const listener = (_event: ElectronEvent, { message, level, sourceUrl }: MessageDetails) => {
      if (!sourceUrl.startsWith("chrome-extension://")) {
        return;
      }

      if (level < CONSOLE_ERROR_LEVEL) {
        this.logger?.debug("Extension service worker log", { sourceUrl, message });

        return;
      }

      // Still reported as the error the worker called it, so development reads
      // what the worker actually wrote rather than a line dressed up as
      // chatter — only the level moves
      if (this.isBenignWorkerConsoleError(message)) {
        this.logger?.debug("Extension service worker error", { sourceUrl, message });

        return;
      }

      this.logger?.error("Extension service worker error", { sourceUrl, message });
    };

    this.serviceWorkerConsoleListeners.set(session, listener);

    session.serviceWorkers.on("console-message", listener);
  }

  /**
   * Whether a worker's error line is one the embedder already accounted for.
   * A prefix rather than the whole line, because what follows it is the
   * extension's own detail — a redacted payload, a request id — and differs
   * line to line.
   */
  private isBenignWorkerConsoleError(message: string) {
    return Boolean(
      this.benignWorkerConsoleErrors?.some((benignWorkerConsoleError) =>
        message.startsWith(benignWorkerConsoleError),
      ),
    );
  }

  /**
   * The icon read off the derived copy every session loading it shares. Every
   * account loads its own instance of the same copy, and each holds the data
   * URL for as long as it holds the action, so reading per session would leave
   * N accounts holding N copies of one base64 string.
   */
  private readActionIconDataUrl(extension: ActionExtension) {
    const derivedDir = path.resolve(extension.path);

    let iconDataUrl = this.actionIconDataUrls.get(derivedDir);

    if (!iconDataUrl) {
      iconDataUrl = readExtensionActionIcon(extension);

      this.actionIconDataUrls.set(derivedDir, iconDataUrl);

      // A failure must not be the answer for every later session, the way the
      // derived copy's is not: a transient EMFILE or EIO on the first session's
      // read would otherwise cost every account the icon until a restart, an
      // account added mid-session included
      const failedIconDataUrl = iconDataUrl;

      iconDataUrl.catch(() => {
        if (this.actionIconDataUrls.get(derivedDir) === failedIconDataUrl) {
          this.actionIconDataUrls.delete(derivedDir);
        }
      });
    }

    return iconDataUrl;
  }

  /** A broken icon costs the button its icon, not the extension its button. */
  private async createAction(extension: ActionExtension) {
    const action = createExtensionAction(extension);

    try {
      action.iconDataUrl = await this.readActionIconDataUrl(extension);
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

    if (this.blockedUrlSessions.delete(session)) {
      session.webRequest.onBeforeRequest(null);
    }

    this.nativeMessaging.teardownSession(session);

    this.alarms.teardownSession(session);

    // This session is already out of `loadedExtensionIdsBySession`, so what is
    // left in it is the sessions that keep their content-script-only copies.
    // An embedder naming a session of its own and never tearing it down never
    // reaches this branch at all, and the log is what would say so if that ever
    // stopped being true
    const workerRoleWasVacated = this.sharedInstance?.teardownSession(session) === true;

    if (workerRoleWasVacated && this.loadedExtensionIdsBySession.size > 0) {
      this.logger?.error("Shared extension instance lost its worker session", {
        orphanedSessions: this.loadedExtensionIdsBySession.size,
      });
    }

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
   * Unloads one extension from one session, leaving the rest of the session's
   * extensions and the session's own setup alone — what `teardownSession` does
   * to all of them at once, for one.
   *
   * It exists for uninstalling: the extension has to stop running before what
   * it wrote can be deleted, or a worker still live rewrites part of the store
   * behind the delete, and on Windows the delete fails outright against the
   * LevelDB files Chromium still holds open.
   */
  unloadExtension(session: Session, extensionId: string) {
    if (!this.loadedExtensionIdsBySession.get(session)?.delete(extensionId)) {
      return;
    }

    session.extensions.removeExtension(extensionId);

    const actions = this.actionsBySession.get(session);

    const actionIndex = actions?.findIndex((action) => action.extensionId === extensionId) ?? -1;

    if (actions && actionIndex !== -1) {
      actions.splice(actionIndex, 1);
    }

    this.logger?.info("Unloaded extension", { id: extensionId });

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
   * origin counts too, since that is all a permission check is given: Electron
   * hands the check handler `GURL::spec()`, which for a standard scheme such as
   * `chrome-extension` always carries the trailing slash, so this is belt and
   * braces rather than a path anyone has hit.
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
