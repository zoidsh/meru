import { describe, expect, test } from "bun:test";
import type { Session } from "electron";
import { createSharedExtensionInstance } from "./index";

function createSession(label: string) {
  return { label } as unknown as Session;
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
