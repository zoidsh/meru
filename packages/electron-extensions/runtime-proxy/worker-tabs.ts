import type { Session, WebContents, WebFrameMain } from "electron";
import type { ExtensionBridge } from "../bridge/bridge";
import { matchesUrl } from "../derive/match-pattern";
import { MAIN_WINDOW_ID, WINDOW_ID_CURRENT } from "../windows/bridge-protocol";
import {
  EXTENSION_SCHEME_PREFIX,
  noTabError,
  type RuntimeProxyCurrentTabResult,
  type RuntimeProxyTab,
  type RuntimeProxyTabQueryInfo,
  type RuntimeProxyWorkerGetTabRequest,
  type RuntimeProxyWorkerGetTabResult,
  type RuntimeProxyWorkerQueryTabsRequest,
  type RuntimeProxyWorkerQueryTabsResult,
  RUNTIME_PROXY_PATHS,
} from "./bridge-protocol";
import { createTabDetails, type GetWebContentsFromFrame } from "./sender";

/**
 * Resolved at call time: a value import of "electron" cannot even be loaded
 * outside Electron, which is where this module's tests run.
 */
function getElectronWebContents() {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents.getAllWebContents();
}

function getElectronWebContentsById(tabId: number) {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents.fromId(tabId);
}

function getElectronWebContentsFromFrame(frame: WebFrameMain) {
  const { webContents } = require("electron") as typeof import("electron");

  return webContents.fromFrame(frame);
}

export type WorkerTabsOptions = {
  /** The session keeping the worker, the only one allowed to ask. */
  getWorkerSession: () => Session | undefined;
  /** Whether a session took the content-script-only role, and is therefore listed. */
  isShimmedSession: (session: Session) => boolean;
  /**
   * Whether a page is the one its window is showing, which is Chrome's `active`
   * and only the embedder can say. Electron's own answer — `isFocused` — is the
   * default, and is the wrong one wherever a window can be unfocused while
   * still showing the page.
   */
  isActiveTab?: (contents: WebContents) => boolean;
  /** Every page the app has, Electron's own list by default. */
  getAllWebContents?: () => WebContents[];
  /** How a tab id resolves to the page behind it, Electron's own mapping by default. */
  getWebContentsById?: (tabId: number) => WebContents | undefined;
  /** How a calling frame resolves to the page it is in, Electron's own mapping by default. */
  getWebContentsFromFrame?: GetWebContentsFromFrame;
  /**
   * The window a page is in: one the loader opened for an extension page
   * (`windows/windows.ts`), or the main window every other page is in, which is
   * the default.
   */
  getWindowId?: (contents: WebContents) => number;
};

/**
 * The worker's own `chrome.tabs.query` and `chrome.tabs.get`, answered from
 * main.
 *
 * Chromium answers both natively, scoped to the browser context the asking
 * extension is loaded into — `TabsQueryFunction` filters the WebContents list
 * by `GetBrowserContext()`, and `tabs.get` resolves an id within it — so in the
 * session the one worker runs in, which holds no account's tabs, a query lists
 * nothing and every account tab is invisible. That is not a cosmetic gap:
 * 1Password tells content scripts the vault locked by asking `tabs.query` for
 * the tabs and then `tabs.sendMessage`-ing each of them, so an empty answer
 * means every account page keeps showing an unlocked inline menu until it is
 * reloaded.
 *
 * Main answers for the worker's own session *and* every session it shims,
 * rather than merging a relayed answer into Chromium's. A merge would carry two
 * `active` semantics — Chromium's `IsFocused` for the worker session's pages
 * and the embedder's for the rest — and two orderings, and the extension would
 * have no way to tell which it was reading. This is where it differs from
 * `tabs.sendMessage`, which must fall through to Chromium for the worker's own
 * session because delivery there is Chromium's; a query depends on nothing but
 * the list.
 *
 * Only the worker session may ask (403 otherwise, as `workerSendToTab` does),
 * and only the worker session and sessions that adopted the content-script-only
 * role are listed — the same line `canResolveTabAcrossSessions` draws for frame
 * queries, so one session's tabs never surface in another's answer. The worker
 * session's extension pages ask too, for an extension that opens windows of its
 * own (`facade/api/page-tabs.ts`): a popout of the password manager's popup
 * page has to see the account's tab the way the toolbar popup it stands in for
 * does. Nothing changes for a shimmed session's own extension pages: their
 * native `chrome.tabs` stays scoped to their session.
 *
 * One window filter has no answer Chrome would give. Chrome's current window is
 * the one the caller is in, and for a popout that is the popout itself, holding
 * nothing but the extension's own page. Meru's popout stands in for Chrome's
 * toolbar popup instead, whose current window is the browser window underneath
 * it — so the current window, and the last focused one, is the main window for
 * every caller, and the active tab in it is the view Meru is showing. A popout
 * is still found by its own `windowId`, or by its URL.
 */
export class WorkerTabs {
  private getWorkerSession: () => Session | undefined;

  private isShimmedSession: (session: Session) => boolean;

  private isActiveTab: (contents: WebContents) => boolean;

  private getAllWebContents: () => WebContents[];

  private getWebContentsById: (tabId: number) => WebContents | undefined;

  private getWebContentsFromFrame: GetWebContentsFromFrame;

  private getWindowId: (contents: WebContents) => number;

  constructor({
    getWorkerSession,
    isShimmedSession,
    isActiveTab = (contents) => contents.isFocused(),
    getAllWebContents = getElectronWebContents,
    getWebContentsById = getElectronWebContentsById,
    getWebContentsFromFrame = getElectronWebContentsFromFrame,
    getWindowId = () => MAIN_WINDOW_ID,
  }: WorkerTabsOptions) {
    this.getWorkerSession = getWorkerSession;

    this.isShimmedSession = isShimmedSession;

    this.isActiveTab = isActiveTab;

    this.getAllWebContents = getAllWebContents;

    this.getWebContentsById = getWebContentsById;

    this.getWebContentsFromFrame = getWebContentsFromFrame;

    this.getWindowId = getWindowId;
  }

  registerRoutes(bridge: ExtensionBridge) {
    bridge.handle(RUNTIME_PROXY_PATHS.workerQueryTabs, ({ session, body, headers }) => {
      if (session !== this.getWorkerSession()) {
        return new Response(null, { status: 403, headers });
      }

      const { queryInfo } = body as unknown as RuntimeProxyWorkerQueryTabsRequest;

      return Response.json(
        { tabs: this.queryTabs(queryInfo) } satisfies RuntimeProxyWorkerQueryTabsResult,
        { headers },
      );
    });

    bridge.handle(RUNTIME_PROXY_PATHS.workerGetTab, ({ session, body, headers }) => {
      if (session !== this.getWorkerSession()) {
        return new Response(null, { status: 403, headers });
      }

      const { tabId } = body as unknown as RuntimeProxyWorkerGetTabRequest;

      return Response.json(this.getTab(tabId) satisfies RuntimeProxyWorkerGetTabResult, {
        headers,
      });
    });

    // Any session, since the frame asking can only learn about the page it is
    // already in
    bridge.handle(RUNTIME_PROXY_PATHS.currentTab, ({ extensionId, senderFrame, headers }) =>
      Response.json(
        {
          tab: this.getCurrentTab(extensionId, senderFrame),
        } satisfies RuntimeProxyCurrentTabResult,
        { headers },
      ),
    );
  }

  /**
   * Every page of the worker's session and of the sessions it shims, in the
   * order Electron's own list has them.
   *
   * Every `WebContents` of those sessions counts, the embedder's own renderer
   * and its popups included, because that is exactly what Chromium's own answer
   * counts for a browser context — `GetWebContentsList()` is not a tab strip.
   * Filtering to what Meru would call a tab would be a second, narrower notion
   * of a tab than the one the rest of the proxy addresses by `WebContents` id,
   * and a message sent to an id a query never listed is worse than a list with
   * a page an extension does not care about in it.
   */
  listTabs(): RuntimeProxyTab[] {
    const tabs: RuntimeProxyTab[] = [];

    for (const contents of this.getAllWebContents()) {
      if (contents.isDestroyed() || !this.isListedSession(contents.session)) {
        continue;
      }

      tabs.push(this.describeTab(contents));
    }

    return tabs;
  }

  /**
   * The listed tabs a `queryInfo` keeps. Electron honors `active`, `audible`,
   * `muted`, `url` and `title` and ignores the rest of Chrome's keys; this
   * honors the same five, and the window filters `RuntimeProxyTabQueryInfo`
   * says why. A `queryInfo` that is not an object at all — or one carrying
   * nothing but ignored keys — filters nothing, which is what `query({})`
   * means.
   */
  queryTabs(queryInfo: RuntimeProxyTabQueryInfo | undefined): RuntimeProxyTab[] {
    if (typeof queryInfo !== "object" || queryInfo === null) {
      return this.listTabs();
    }

    const { active, audible, muted, url, title, currentWindow, lastFocusedWindow } = queryInfo;

    const windowId = queryInfo.windowId === WINDOW_ID_CURRENT ? MAIN_WINDOW_ID : queryInfo.windowId;

    return this.listTabs().filter((tab) => {
      if (typeof active === "boolean" && tab.active !== active) {
        return false;
      }

      if (typeof windowId === "number" && tab.windowId !== windowId) {
        return false;
      }

      if (
        typeof currentWindow === "boolean" &&
        (tab.windowId === MAIN_WINDOW_ID) !== currentWindow
      ) {
        return false;
      }

      if (
        typeof lastFocusedWindow === "boolean" &&
        (tab.windowId === MAIN_WINDOW_ID) !== lastFocusedWindow
      ) {
        return false;
      }

      if (typeof audible === "boolean" && tab.audible !== audible) {
        return false;
      }

      if (typeof muted === "boolean" && tab.mutedInfo.muted !== muted) {
        return false;
      }

      if (url !== undefined && !matchesAnyPattern(url, tab.url)) {
        return false;
      }

      if (typeof title === "string" && !matchesGlob(title, tab.title)) {
        return false;
      }

      return true;
    });
  }

  /**
   * One tab by id. An id naming a page of a session this neither keeps nor
   * shims answers the way a page that is gone does: Chrome's own "no tab with
   * id", rather than a tab from a session the worker has no business reading.
   */
  getTab(tabId: unknown): RuntimeProxyWorkerGetTabResult {
    if (typeof tabId !== "number") {
      return { status: "noTarget", error: noTabError(tabId) };
    }

    const contents = this.getWebContentsById(tabId);

    if (!contents || contents.isDestroyed() || !this.isListedSession(contents.session)) {
      return { status: "noTarget", error: noTabError(tabId) };
    }

    return { status: "tab", tab: this.describeTab(contents) };
  }

  /**
   * `tabs.getCurrent` for an extension frame: the page it is embedded in, which
   * is what Chrome answers for an extension iframe inside a tab — Bitwarden's
   * inline menu is one — and nothing for a top-level extension page, which
   * Chrome's toolbar popup is and Meru's popouts stand in for.
   *
   * Only the calling extension's own frame is answered, and only in a session
   * the worker keeps or shims, the sessions every other answer here is drawn
   * from.
   */
  getCurrentTab(extensionId: string, senderFrame: WebFrameMain | undefined) {
    if (
      !senderFrame ||
      senderFrame.isDestroyed() ||
      senderFrame.parent === null ||
      !senderFrame.url.startsWith(`${EXTENSION_SCHEME_PREFIX}${extensionId}/`)
    ) {
      return null;
    }

    const contents = this.getWebContentsFromFrame(senderFrame);

    if (!contents || contents.isDestroyed() || !this.isListedSession(contents.session)) {
      return null;
    }

    return this.describeTab(contents);
  }

  private describeTab(contents: WebContents) {
    return createTabDetails(contents, {
      active: this.isActiveTab(contents),
      windowId: this.getWindowId(contents),
    });
  }

  private isListedSession(session: Session) {
    return session === this.getWorkerSession() || this.isShimmedSession(session);
  }
}

/**
 * Chrome's `url` filter, which takes one match pattern or several and keeps a
 * tab any of them reaches.
 */
function matchesAnyPattern(patterns: string | string[], url: string) {
  if (typeof patterns === "string") {
    return matchesUrl(patterns, url);
  }

  if (!Array.isArray(patterns)) {
    return true;
  }

  return patterns.some((pattern) => typeof pattern === "string" && matchesUrl(pattern, url));
}

/**
 * Chrome's `title` filter, which is a glob rather than a match pattern: `*`
 * stands for any run of characters and `?` for exactly one, as Chromium's own
 * `base::MatchPattern` reads it. Escaping is not honored, there being no `\`
 * escape in the shape an extension writes a title filter in.
 */
function matchesGlob(pattern: string, title: string) {
  const expression = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replaceAll("\\*", ".*")
    .replaceAll("\\?", ".");

  return new RegExp(`^${expression}$`).test(title);
}
