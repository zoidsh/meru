import { WORKSPACE_APP_PRELOAD_ARGUMENTS } from "@meru/shared/workspace-apps";
import { webFrame } from "electron";

declare global {
  interface Window {
    _docs_chrome_extension_exists: boolean;
    _docs_chrome_extension_permissions: string[];
  }
}

/**
 * The "Docs Offline" Chrome extension injects a `page_embed_script.js` into
 * every Docs page that does nothing but set these globals, telling Docs which
 * clipboard permissions the extension grants the page. Without them the Edit
 * menu's cut, copy and paste items only offer to install the extension. Meru
 * grants the clipboard access itself through the view's `enableDeprecatedPaste`
 * preference, so only the globals are missing.
 */
function markDocsOfflineExtensionAsInstalled() {
  window._docs_chrome_extension_exists = true;
  window._docs_chrome_extension_permissions = ["clipboardRead", "clipboardWrite"];
}

export function initDocsPreload() {
  // Only views created for the Docs app carry `enableDeprecatedPaste`. A view
  // that navigated here in place has no paste grant, so advertising the
  // extension would make Docs' menu paste fail silently — keep the install
  // prompt there instead.
  if (!process.argv.includes(WORKSPACE_APP_PRELOAD_ARGUMENTS.docsMenuClipboard)) {
    return;
  }

  webFrame
    .executeJavaScript(`(${markDocsOfflineExtensionAsInstalled.toString()})()`)
    .catch((error) => {
      console.error("Failed to mark the Docs Offline extension as installed:", error);
    });
}
