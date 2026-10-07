import { describe, expect, test } from "bun:test";
import { deriveManifest } from "@meru/electron-extensions/derive/manifest";
import { WindowCloseFallbackRejections } from "@meru/electron-extensions/runtime-proxy/window-close-rejection";
import {
  BITWARDEN_EXTENSION_ID,
  curatedExtensions,
  ONEPASSWORD_EXTENSION_ID,
} from "@meru/shared/extensions";

/**
 * The parts of Bitwarden 2026.9.2's manifest the derive reads. The package
 * itself comes from the Chrome Web Store, which no unit test reaches.
 */
const BITWARDEN_MANIFEST = {
  manifest_version: 3,
  name: "Bitwarden",
  version: "2026.9.2",
  background: { service_worker: "background.js" },
  permissions: ["activeTab", "alarms", "scripting", "storage", "tabs", "webNavigation"],
  optional_permissions: ["nativeMessaging", "privacy"],
  content_scripts: [
    {
      all_frames: false,
      js: ["content/content-message-handler.js"],
      matches: ["*://*/*", "file:///*"],
      exclude_matches: ["*://*/*.xml*", "file:///*.xml*"],
      run_at: "document_start",
    },
    {
      all_frames: true,
      css: ["content/autofill.css"],
      js: ["content/trigger-autofill-script-injection.js"],
      matches: ["*://*/*", "file:///*"],
      exclude_matches: ["*://*/*.xml*", "file:///*.xml*"],
      run_at: "document_start",
    },
  ],
};

const bitwarden = curatedExtensions.find(({ id }) => id === BITWARDEN_EXTENSION_ID);

function deriveCopy(role: "worker" | "contentScriptOnly") {
  return deriveManifest(BITWARDEN_MANIFEST, {
    facadeFileName: "chrome-facade.js",
    serviceWorkerFileName: "service-worker.js",
    bridgeConnectSource: "meru-extension-bridge:",
    contentScriptMatches: bitwarden?.contentScriptMatches,
    declaredContentScripts: bitwarden?.declaredContentScripts,
    sharedInstance:
      role === "worker"
        ? { role, relayFileName: "runtime-proxy-relay.js" }
        : { role, shimFileName: "runtime-proxy-shim.js" },
  }).manifest;
}

describe("the Bitwarden catalog entry", () => {
  test("declares its injected scripts in an account's copy, clamped to Google's sign-in hosts", () => {
    const contentScripts = deriveCopy("contentScriptOnly").content_scripts ?? [];

    expect(contentScripts.map(({ js }) => js)).toEqual([
      ["runtime-proxy-shim.js", "content/content-message-handler.js"],
      ["runtime-proxy-shim.js", "content/trigger-autofill-script-injection.js"],
      [
        "runtime-proxy-shim.js",
        "content/bootstrap-autofill-overlay.js",
        "content/contextMenuHandler.js",
      ],
      // The page's own world, where the shim cannot start
      ["content/fido2-page-script.js"],
      ["runtime-proxy-shim.js", "content/fido2-content-script.js"],
    ]);

    for (const contentScript of contentScripts) {
      expect(contentScript.matches).toEqual([
        "https://accounts.google.com/*",
        "https://myaccount.google.com/*",
      ]);
    }

    expect(contentScripts[3]?.world).toBe("MAIN");
  });

  test("leaves the worker's copy to inject them itself", () => {
    expect(deriveCopy("worker").content_scripts?.flatMap(({ js }) => js ?? [])).toEqual([
      "content/content-message-handler.js",
      "content/trigger-autofill-script-injection.js",
    ]);
  });

  test("grants only an optional permission its manifest declares", () => {
    for (const permission of bitwarden?.grantableOptionalPermissions ?? []) {
      expect(BITWARDEN_MANIFEST.optional_permissions).toContain(permission);
    }
  });

  test("opens its window page only as an extension that opens windows", () => {
    for (const curatedExtension of curatedExtensions) {
      if (curatedExtension.windowPagePath !== undefined) {
        expect(curatedExtension.opensExtensionWindows).toBe(true);
      }
    }

    expect(bitwarden?.windowPagePath).toBe("popup/index.html");
  });

  test("blocks nothing of its own", () => {
    expect(bitwarden?.telemetryUrls).toBeUndefined();
  });
});

/**
 * Bitwarden 2026.9.2's own code, reproduced so its reply and its page script's
 * reading of it are pinned: `FallbackRequestedError` in
 * `libs/common/src/platform/abstractions/fido2/fido2-client.service.abstraction.ts`,
 * the worker's `handleExtensionMessage` in
 * `apps/browser/src/autofill/fido2/background/fido2.background.ts`, and the
 * page script's `createWebAuthnCredential` and `rehydrateDOMException`.
 */
class FallbackRequestedError extends Error {
  readonly fallbackRequested = true;

  constructor() {
    super("FallbackRequested");
  }
}

function replyWithError(error: Error): { error: Record<string, unknown> } {
  return { error: { ...error, message: error.message } };
}

function readInPageScript(error: Record<string, unknown>) {
  if ("fallbackRequested" in error && error.fallbackRequested) {
    return "fallback";
  }

  if (error.name === "NotAllowedError" && typeof error.message === "string") {
    return new DOMException(error.message, "NotAllowedError");
  }

  return error;
}

describe("the Bitwarden passkey popout rejection", () => {
  const rejections = new WindowCloseFallbackRejections(
    (extensionId) =>
      curatedExtensions.find(({ id }) => id === extensionId)?.rejectFallbackOnWindowClose,
  );

  test("matches the reply Bitwarden's worker sends when it asks for the fallback", () => {
    const reply = replyWithError(new FallbackRequestedError());

    expect(reply).toEqual({ error: { fallbackRequested: true, message: "FallbackRequested" } });

    expect(readInPageScript(reply.error)).toBe("fallback");
  });

  test("turns it into the DOMException Chrome rejects a dismissed passkey dialog with", () => {
    for (const command of ["fido2RegisterCredentialRequest", "fido2GetCredentialRequest"]) {
      const request = rejections.track(BITWARDEN_EXTENSION_ID, { command, requestId: "1" });

      expect(request).toBeDefined();

      rejections.windowOpened(BITWARDEN_EXTENSION_ID, 2);

      rejections.windowClosedByUser(BITWARDEN_EXTENSION_ID, 2);

      const result = rejections.settle(request as object, {
        status: "replied",
        reply: replyWithError(new FallbackRequestedError()),
      });

      const reply = (result as { reply: { error: Record<string, unknown> } }).reply;

      const rejection = readInPageScript(reply.error);

      expect(rejection).toBeInstanceOf(DOMException);

      expect((rejection as DOMException).name).toBe("NotAllowedError");
    }
  });

  test("is not set for 1Password", () => {
    expect(
      curatedExtensions.find(({ id }) => id === ONEPASSWORD_EXTENSION_ID)
        ?.rejectFallbackOnWindowClose,
    ).toBeUndefined();

    expect(
      rejections.track(ONEPASSWORD_EXTENSION_ID, { command: "fido2RegisterCredentialRequest" }),
    ).toBeUndefined();
  });

  test("opts in only where the extension opens windows", () => {
    for (const curatedExtension of curatedExtensions) {
      if (curatedExtension.rejectFallbackOnWindowClose !== undefined) {
        expect(curatedExtension.opensExtensionWindows).toBe(true);
      }
    }
  });
});
