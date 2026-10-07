import { describe, expect, test } from "bun:test";
import { deriveManifest } from "@meru/electron-extensions/derive/manifest";
import { BITWARDEN_EXTENSION_ID, curatedExtensions } from "@meru/shared/extensions";

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
