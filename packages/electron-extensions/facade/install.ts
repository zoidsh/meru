import { createCommands } from "./api/commands";
import { createContextMenus } from "./api/context-menus";
import { installNativeMessaging } from "./api/native-messaging";
import { createNotifications } from "./api/notifications";
import { createPrivacy } from "./api/privacy";
import { createTabs } from "./api/tabs";
import { createWebNavigation } from "./api/web-navigation";
import { createWebRequest } from "./api/web-request";
import { createWindows } from "./api/windows";
import type { ChromeNamespace } from "./lib/chrome";
import { fillMissing } from "./lib/fill";

/**
 * Everything the facade has to offer, built without looking at what Electron
 * implements: noop namespaces for what Electron is missing entirely, and the
 * odd member for a namespace it ships half-finished. Promoting one of these to
 * a real implementation later means backing it with an embedder transport —
 * where the facade is installed and how it is merged stay the same.
 */
export function createChromeFacade(): ChromeNamespace {
  return {
    commands: createCommands(),
    contextMenus: createContextMenus(),
    notifications: createNotifications(),
    privacy: createPrivacy(),
    tabs: createTabs(),
    webNavigation: createWebNavigation(),
    webRequest: createWebRequest(),
    windows: createWindows(),
  };
}

/**
 * Completes an extension API object in place — the `chrome` object of a service
 * worker, a popup, an options page, any `chrome-extension://` frame. Almost
 * nothing native is replaced or wrapped: every namespace and member Electron
 * implements is left exactly as it is, and only the gaps around it are filled
 * (see the noop-first decision in the feature docs).
 *
 * Native messaging is the one exception, and it is one because filling gaps
 * cannot help there: Electron implements `connectNative` and refuses every host
 * from it (see `api/native-messaging.ts`).
 */
export function installChromeFacade(
  extensionApi: ChromeNamespace,
  facade: ChromeNamespace = createChromeFacade(),
) {
  fillMissing(extensionApi, facade);

  installNativeMessaging(extensionApi);
}
