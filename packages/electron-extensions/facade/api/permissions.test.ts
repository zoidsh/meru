import { afterEach, describe, expect, test } from "bun:test";
import { PERMISSIONS_PATHS } from "../../permissions/bridge-protocol";
import type { ChromeEvent, ChromeNamespace } from "../lib/chrome";
import { createPermissions } from "./permissions";

type ExtensionManifest = {
  permissions?: string[];
  optional_permissions?: string[];
  host_permissions?: string[];
};

const extensionGlobals = globalThis as unknown as {
  chrome?: ChromeNamespace;
  fetch: typeof fetch;
};

const originalFetch = extensionGlobals.fetch;

afterEach(() => {
  extensionGlobals.fetch = originalFetch;

  delete extensionGlobals.chrome;
});

/**
 * The manifest Chromium loaded, which is where the required permissions come
 * from, under the one global the namespace reads them through.
 */
function installManifest(manifest: ExtensionManifest) {
  extensionGlobals.chrome = { runtime: { getManifest: () => manifest } };

  return extensionGlobals.chrome.runtime as ChromeNamespace;
}

/**
 * The main process's end of it (`permissions/permissions.ts`), with the one
 * behavior the answers turn on: a request is granted only for a permission the
 * embedder allowed this extension.
 */
function installFakeBridge({ grantable = ["nativeMessaging"] }: { grantable?: string[] } = {}) {
  const granted = new Set<string>();

  const paths: string[] = [];

  let refusalStatus: number | undefined;

  extensionGlobals.fetch = (async (url: string, init: RequestInit) => {
    const { pathname } = new URL(url);

    const { permissions } = JSON.parse(init.body as string) as { permissions: string[] };

    paths.push(pathname);

    if (refusalStatus !== undefined) {
      return new Response(null, { status: refusalStatus });
    }

    if (pathname === PERMISSIONS_PATHS.request) {
      for (const permission of permissions.filter((name) => grantable.includes(name))) {
        granted.add(permission);
      }
    }

    if (pathname === PERMISSIONS_PATHS.remove) {
      for (const permission of permissions) {
        granted.delete(permission);
      }
    }

    return Response.json({ permissions: [...granted] });
  }) as unknown as typeof fetch;

  return {
    paths,
    granted,
    refuse: (status: number) => {
      refusalStatus = status;
    },
  };
}

function namespaceMethod(namespace: ChromeNamespace, name: string) {
  return namespace[name] as (...callArguments: unknown[]) => Promise<unknown>;
}

const BITWARDEN_MANIFEST: ExtensionManifest = {
  permissions: ["storage", "alarms"],
  optional_permissions: ["nativeMessaging", "clipboardRead"],
  host_permissions: ["<all_urls>"],
};

describe("createPermissions", () => {
  test("answers contains from the permissions the manifest requires", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    const permissions = createPermissions();

    expect(await namespaceMethod(permissions, "contains")({ permissions: ["storage"] })).toBe(true);

    expect(await namespaceMethod(permissions, "contains")({ permissions: ["bookmarks"] })).toBe(
      false,
    );
  });

  /*
   * The whole reason the namespace is honest rather than blanket-granted: a
   * `contains` that answered `true` here made Bitwarden believe biometric
   * unlock was set up and sent it into a `connectNative` retry loop.
   */
  test("answers contains false for an optional permission nothing has granted", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    expect(
      await namespaceMethod(createPermissions(), "contains")({ permissions: ["nativeMessaging"] }),
    ).toBe(false);
  });

  test("answers contains true for a permission a request granted", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    const permissions = createPermissions();

    expect(
      await namespaceMethod(permissions, "request")({ permissions: ["nativeMessaging"] }),
    ).toBe(true);

    expect(
      await namespaceMethod(permissions, "contains")({ permissions: ["nativeMessaging"] }),
    ).toBe(true);
  });

  test("answers contains for an origin the manifest's host permissions cover", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    const permissions = createPermissions();

    expect(
      await namespaceMethod(
        permissions,
        "contains",
      )({
        origins: ["https://accounts.google.com/*"],
      }),
    ).toBe(true);

    expect(await namespaceMethod(permissions, "contains")({ origins: ["<all_urls>"] })).toBe(true);
  });

  test("answers contains false for an origin outside narrowed host permissions", async () => {
    installManifest({ host_permissions: ["https://accounts.google.com/*"] });

    installFakeBridge();

    const permissions = createPermissions();

    expect(
      await namespaceMethod(
        permissions,
        "contains",
      )({
        origins: ["https://accounts.google.com/signin"],
      }),
    ).toBe(true);

    expect(
      await namespaceMethod(permissions, "contains")({ origins: ["https://example.com/*"] }),
    ).toBe(false);

    expect(await namespaceMethod(permissions, "contains")({ origins: ["<all_urls>"] })).toBe(false);
  });

  test("answers contains true for a query that names nothing, and fails any call with no query", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    expect(await namespaceMethod(createPermissions(), "contains")({})).toBe(true);

    for (const methodName of ["contains", "request", "remove"]) {
      await expect(namespaceMethod(createPermissions(), methodName)()).rejects.toThrow(TypeError);
    }
  });

  test("answers request and remove true for a query that names nothing", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge();

    expect(await namespaceMethod(createPermissions(), "request")({})).toBe(true);

    expect(await namespaceMethod(createPermissions(), "remove")({})).toBe(true);

    expect(bridge.paths).toEqual([]);
  });

  test("answers contains and getAll without a grant the manifest no longer declares optional", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge();

    bridge.granted.add("bookmarks");

    const permissions = createPermissions();

    expect(await namespaceMethod(permissions, "contains")({ permissions: ["bookmarks"] })).toBe(
      false,
    );

    expect(await namespaceMethod(permissions, "getAll")()).toEqual({
      permissions: ["storage", "alarms"],
      origins: ["<all_urls>"],
    });
  });

  test("answers getAll with the required permissions, the grants and the origins", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    const permissions = createPermissions();

    await namespaceMethod(permissions, "request")({ permissions: ["nativeMessaging"] });

    expect(await namespaceMethod(permissions, "getAll")()).toEqual({
      permissions: ["storage", "alarms", "nativeMessaging"],
      origins: ["<all_urls>"],
    });
  });

  test("refuses a request for an optional permission the embedder does not allow", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge();

    const permissions = createPermissions();

    expect(await namespaceMethod(permissions, "request")({ permissions: ["clipboardRead"] })).toBe(
      false,
    );

    expect(bridge.granted.size).toBe(0);
  });

  test("fails a request for a permission the manifest never declared optional", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge({ grantable: ["bookmarks"] });

    await expect(
      namespaceMethod(createPermissions(), "request")({ permissions: ["bookmarks"] }),
    ).rejects.toThrow("Only permissions specified in the manifest may be requested.");

    // Refused in the context, so the embedder is never asked
    expect(bridge.paths).toEqual([]);
  });

  test("grants a request for a permission the manifest already requires", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge();

    expect(
      await namespaceMethod(createPermissions(), "request")({ permissions: ["storage"] }),
    ).toBe(true);

    expect(bridge.paths).toEqual([]);
  });

  test("fails a request for an origin the manifest does not hold", async () => {
    installManifest({ host_permissions: ["https://accounts.google.com/*"] });

    installFakeBridge();

    await expect(
      namespaceMethod(createPermissions(), "request")({ origins: ["https://example.com/*"] }),
    ).rejects.toThrow("Only permissions specified in the manifest may be requested.");
  });

  test("removes a granted permission", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    const permissions = createPermissions();

    await namespaceMethod(permissions, "request")({ permissions: ["nativeMessaging"] });

    expect(await namespaceMethod(permissions, "remove")({ permissions: ["nativeMessaging"] })).toBe(
      true,
    );

    expect(
      await namespaceMethod(permissions, "contains")({ permissions: ["nativeMessaging"] }),
    ).toBe(false);
  });

  test("fails to remove a permission the manifest requires", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge();

    await expect(
      namespaceMethod(createPermissions(), "remove")({ permissions: ["storage"] }),
    ).rejects.toThrow("You cannot remove required permissions.");

    expect(bridge.paths).toEqual([]);
  });

  test("answers from the manifest alone when the bridge cannot be reached", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge();

    bridge.refuse(403);

    const permissions = createPermissions();

    expect(await namespaceMethod(permissions, "contains")({ permissions: ["storage"] })).toBe(true);

    expect(
      await namespaceMethod(permissions, "contains")({ permissions: ["nativeMessaging"] }),
    ).toBe(false);

    expect(
      await namespaceMethod(permissions, "request")({ permissions: ["nativeMessaging"] }),
    ).toBe(false);

    expect(await namespaceMethod(permissions, "getAll")()).toEqual({
      permissions: ["storage", "alarms"],
      origins: ["<all_urls>"],
    });
  });

  test("answers nothing at all for the site-access requests Chrome added", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const permissions = createPermissions();

    expect(
      await namespaceMethod(permissions, "addHostAccessRequest")({ tabId: 1 }),
    ).toBeUndefined();

    expect(
      await namespaceMethod(permissions, "removeHostAccessRequest")({ tabId: 1 }),
    ).toBeUndefined();
  });

  test("takes listeners for the events it never fires", () => {
    const permissions = createPermissions();

    for (const eventName of ["onAdded", "onRemoved"]) {
      const event = permissions[eventName] as ChromeEvent;

      const listener = () => {};

      event.addListener(listener);

      expect(event.hasListener(listener)).toBe(true);

      event.removeListener(listener);

      expect(event.hasListeners()).toBe(false);
    }
  });
});

/**
 * The callback form, which is what a `webextension-polyfill`-shaped wrapper
 * over `chrome` calls — 1Password builds one whenever `browser` is missing, so
 * every method has to answer a trailing callback as well as a promise. Chrome
 * leaves `lastError` unset on all of these, and so does this.
 */
describe("createPermissions in callback form", () => {
  function callWithCallback(
    permissions: ChromeNamespace,
    name: string,
    ...callArguments: unknown[]
  ) {
    const { promise: answered, resolve } = Promise.withResolvers<{
      result: unknown;
      lastError: unknown;
    }>();

    const runtime = extensionGlobals.chrome?.runtime as ChromeNamespace;

    const returned = namespaceMethod(permissions, name)(...callArguments, (result: unknown) => {
      resolve({ result, lastError: runtime.lastError });
    });

    return { returned, answered };
  }

  test("answers every method through a trailing callback and returns nothing", async () => {
    installManifest(BITWARDEN_MANIFEST);

    installFakeBridge();

    const permissions = createPermissions();

    const calls: [string, unknown[], unknown][] = [
      ["contains", [{ permissions: ["storage"] }], true],
      ["getAll", [], { permissions: ["storage", "alarms"], origins: ["<all_urls>"] }],
      ["request", [{ permissions: ["nativeMessaging"] }], true],
      ["remove", [{ permissions: ["nativeMessaging"] }], true],
      ["addHostAccessRequest", [{ tabId: 1 }], undefined],
      ["removeHostAccessRequest", [{ tabId: 1 }], undefined],
    ];

    for (const [name, callArguments, expected] of calls) {
      const { returned, answered } = callWithCallback(permissions, name, ...callArguments);

      expect(returned).toBeUndefined();

      const { result, lastError } = await answered;

      expect(result).toEqual(expected);

      expect(lastError).toBeUndefined();
    }
  });

  test("answers a callback even when the bridge cannot be reached", async () => {
    installManifest(BITWARDEN_MANIFEST);

    const bridge = installFakeBridge();

    bridge.refuse(403);

    const { answered } = callWithCallback(createPermissions(), "contains", {
      permissions: ["nativeMessaging"],
    });

    expect((await answered).result).toBe(false);
  });
});
