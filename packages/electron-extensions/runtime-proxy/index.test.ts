import { describe, expect, test } from "bun:test";
import type { Session } from "electron";
import { createSharedExtensionInstance } from "./index";

/**
 * Role adoption alone, which needs no Electron: `install` is what builds the
 * `RuntimeProxy`, and every method here guards on it, so a shared instance
 * that was never installed hands out roles and nothing else.
 */
function createRoleAssigner() {
  return createSharedExtensionInstance({
    shimScriptPath: "/shim.js",
    relayScriptPath: "/relay.js",
  });
}

function createSession(label: string) {
  return { label } as unknown as Session;
}

describe("createSharedExtensionInstance role adoption", () => {
  test("the first session set up keeps the worker and every later one is content-script-only", () => {
    const sharedInstance = createRoleAssigner();

    expect(sharedInstance.adoptSession(createSession("first"))).toEqual({
      role: "worker",
      relayScriptPath: "/relay.js",
    });

    expect(sharedInstance.adoptSession(createSession("second"))).toEqual({
      role: "contentScriptOnly",
      shimScriptPath: "/shim.js",
    });
  });

  test("a session asked twice keeps the role it has", () => {
    const sharedInstance = createRoleAssigner();

    const workerSession = createSession("worker");

    expect(sharedInstance.adoptSession(workerSession).role).toBe("worker");
    expect(sharedInstance.adoptSession(workerSession).role).toBe("worker");
  });

  test("tearing down a content-script-only session leaves the worker where it is", () => {
    const sharedInstance = createRoleAssigner();

    const workerSession = createSession("worker");

    sharedInstance.adoptSession(workerSession);

    const shimSession = createSession("shim");

    sharedInstance.adoptSession(shimSession);

    sharedInstance.teardownSession(shimSession);

    expect(sharedInstance.adoptSession(createSession("third")).role).toBe("contentScriptOnly");
  });

  /*
   * The behavior the feature doc records rather than one anybody wants: the
   * surviving sessions keep the content-script-only copies they were derived
   * with and have no worker to reach until the app restarts, because
   * `adoptSession` is reached only from `Extensions.setupSession` and a
   * session is set up once, when its account is constructed. What this pins is
   * that the role is genuinely vacant afterwards, so the next session set up —
   * an account added after the removal — picks it up.
   */
  test("tearing down the worker session vacates the role for the next session set up", () => {
    const sharedInstance = createRoleAssigner();

    const workerSession = createSession("worker");

    sharedInstance.adoptSession(workerSession);

    const shimSession = createSession("shim");

    sharedInstance.adoptSession(shimSession);

    sharedInstance.teardownSession(workerSession);

    expect(sharedInstance.adoptSession(createSession("added-later")).role).toBe("worker");
  });
});
