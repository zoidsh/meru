import { describe, expect, mock, test } from "bun:test";
import type { Session, WebContents } from "electron";
import type { ExtensionBridge, ExtensionBridgeHandler } from "../bridge/bridge";
import { type RuntimeProxyWorkerQueryTabsResult, RUNTIME_PROXY_PATHS } from "./bridge-protocol";
import { createSharedExtensionInstance } from "./index";

const EXTENSION_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

function createSession(label: string) {
  return {
    label,
    // What `setWorkerSession` attaches its worker-liveness listener to
    serviceWorkers: { on: () => undefined, removeListener: () => undefined },
  } as unknown as Session;
}

/**
 * Role adoption alone, which needs no Electron: `install` is what builds the
 * `RuntimeProxy`, and every method here guards on it, so a shared instance
 * that was never installed hands out roles and nothing else.
 */
function createRoleAssigner(workerSession: Session) {
  return createSharedExtensionInstance({
    shimScriptPath: "/shim.js",
    relayScriptPath: "/relay.js",
    getWorkerSession: () => workerSession,
  });
}

describe("createSharedExtensionInstance role adoption", () => {
  test("the session the embedder names keeps the worker, whenever it is set up", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    // Set up after another session, which under the rule this replaced would
    // have been the one keeping it
    expect(sharedInstance.adoptSession(createSession("first"))).toEqual({
      role: "contentScriptOnly",
      shimScriptPath: "/shim.js",
    });

    expect(sharedInstance.adoptSession(workerSession)).toEqual({
      role: "worker",
      relayScriptPath: "/relay.js",
    });

    expect(sharedInstance.adoptSession(createSession("third"))).toEqual({
      role: "contentScriptOnly",
      shimScriptPath: "/shim.js",
    });
  });

  test("a session asked twice keeps the role it has", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    expect(sharedInstance.adoptSession(workerSession).role).toBe("worker");
    expect(sharedInstance.adoptSession(workerSession).role).toBe("worker");

    const shimSession = createSession("shim");

    expect(sharedInstance.adoptSession(shimSession).role).toBe("contentScriptOnly");
    expect(sharedInstance.adoptSession(shimSession).role).toBe("contentScriptOnly");
  });

  /*
   * The point of the whole design: an account session going takes nothing with
   * it, because it never held the worker in the first place. What the embedder
   * names — Electron's default session — no account owns, so the one worker and
   * the one sign-in outlive every removal.
   */
  test("tearing down a content-script-only session leaves the worker where it is", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    sharedInstance.adoptSession(workerSession);

    const shimSession = createSession("shim");

    sharedInstance.adoptSession(shimSession);

    expect(sharedInstance.teardownSession(shimSession)).toBe(false);

    expect(sharedInstance.adoptSession(workerSession).role).toBe("worker");
  });

  /*
   * The worker session is the embedder's own, so this is shutdown rather than
   * anything a user can do — and the answer is what the loader logs to say so
   * if that ever stops being true.
   */
  test("tearing down the worker session answers that the role was vacated", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    sharedInstance.adoptSession(workerSession);

    expect(sharedInstance.teardownSession(workerSession)).toBe(true);

    // And a session torn down before it ever adopted anything is not the worker
    expect(sharedInstance.teardownSession(createSession("never-set-up"))).toBe(false);
  });

  test("a session set up after the worker's teardown does not inherit the role", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    sharedInstance.adoptSession(workerSession);

    sharedInstance.teardownSession(workerSession);

    expect(sharedInstance.adoptSession(createSession("added-later")).role).toBe(
      "contentScriptOnly",
    );
  });
});

/*
 * What the loader asks before it answers a `chrome.webNavigation` frame query
 * for a tab of a session other than the asking one. The worker has to cross —
 * it runs in a session holding no account's tabs, and 1Password finds the
 * frame owning a form with `getFrame` before it relays an inline-menu click to
 * it — and nothing else may.
 */
describe("createSharedExtensionInstance tab resolution across sessions", () => {
  test("the worker resolves a tab of any session it shims", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    sharedInstance.adoptSession(workerSession);

    const firstAccountSession = createSession("first-account");

    const secondAccountSession = createSession("second-account");

    sharedInstance.adoptSession(firstAccountSession);
    sharedInstance.adoptSession(secondAccountSession);

    expect(sharedInstance.canResolveTabAcrossSessions(workerSession, firstAccountSession)).toBe(
      true,
    );
    expect(sharedInstance.canResolveTabAcrossSessions(workerSession, secondAccountSession)).toBe(
      true,
    );
  });

  test("a shimmed session resolves no other session's tab", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    sharedInstance.adoptSession(workerSession);

    const firstAccountSession = createSession("first-account");

    const secondAccountSession = createSession("second-account");

    sharedInstance.adoptSession(firstAccountSession);
    sharedInstance.adoptSession(secondAccountSession);

    expect(
      sharedInstance.canResolveTabAcrossSessions(firstAccountSession, secondAccountSession),
    ).toBe(false);

    // Not the worker's own tabs either, which is the account reaching into the
    // app's own session
    expect(sharedInstance.canResolveTabAcrossSessions(firstAccountSession, workerSession)).toBe(
      false,
    );
  });

  test("the worker resolves no tab of a session this never adopted", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    sharedInstance.adoptSession(workerSession);

    expect(
      sharedInstance.canResolveTabAcrossSessions(workerSession, createSession("never-set-up")),
    ).toBe(false);

    // And a session that went takes its tabs with it
    const accountSession = createSession("account");

    sharedInstance.adoptSession(accountSession);

    sharedInstance.teardownSession(accountSession);

    expect(sharedInstance.canResolveTabAcrossSessions(workerSession, accountSession)).toBe(false);
  });

  test("nothing crosses before the worker session is adopted", () => {
    const workerSession = createSession("worker");

    const sharedInstance = createRoleAssigner(workerSession);

    const accountSession = createSession("account");

    sharedInstance.adoptSession(accountSession);

    expect(sharedInstance.canResolveTabAcrossSessions(workerSession, accountSession)).toBe(false);
  });
});

/*
 * The worker's own `tabs.query` and `tabs.get` are answered from main for the
 * worker's session and the sessions it shims, and the shared instance is what
 * says which those are. It is the same bookkeeping
 * `canResolveTabAcrossSessions` answers from, so what is worth holding here is
 * that the predicate handed to the proxy is that bookkeeping rather than a copy
 * of it: a session adopted after the proxy was built is listed, and a session
 * torn down stops being.
 */
describe("createSharedExtensionInstance tab listing across sessions", () => {
  function createContents(contentsId: number, session: Session, url: string) {
    return {
      id: contentsId,
      session,
      getURL: () => url,
      getTitle: () => "A page",
      isDestroyed: () => false,
      isLoading: () => false,
      isFocused: () => false,
      isCurrentlyAudible: () => false,
      isAudioMuted: () => false,
    } as unknown as WebContents;
  }

  test("lists a session from the moment it is adopted until it is torn down", async () => {
    const workerSession = createSession("worker");

    const accountSession = createSession("account");

    const allContents = [
      createContents(9, workerSession, "https://127.0.0.1/worker-page"),
      createContents(7, accountSession, "https://mail.google.com/mail/u/0/"),
    ];

    // `WorkerTabs` resolves Electron's own list at call time, which is what
    // lets a test hand it one
    mock.module("electron", () => ({
      webContents: {
        getAllWebContents: () => allContents,
        fromId: (contentsId: number) => allContents.find((contents) => contents.id === contentsId),
      },
    }));

    const routes = new Map<string, ExtensionBridgeHandler>();

    const bridge = {
      handle: (pathName: string, handler: ExtensionBridgeHandler) => {
        routes.set(pathName, handler);
      },
    } as unknown as ExtensionBridge;

    const sharedInstance = createRoleAssigner(workerSession);

    sharedInstance.install({ bridge });

    sharedInstance.adoptSession(workerSession);

    const queryTabs = async () => {
      const response = await routes.get(RUNTIME_PROXY_PATHS.workerQueryTabs)?.({
        session: workerSession,
        extensionId: EXTENSION_ID,
        senderFrame: undefined,
        body: {},
        headers: {},
      });

      const result = (await response?.json()) as RuntimeProxyWorkerQueryTabsResult;

      return result.tabs.map((tab) => tab.id);
    };

    expect(await queryTabs()).toEqual([9]);

    sharedInstance.adoptSession(accountSession);

    expect(await queryTabs()).toEqual([9, 7]);

    sharedInstance.teardownSession(accountSession);

    expect(await queryTabs()).toEqual([9]);
  });
});
