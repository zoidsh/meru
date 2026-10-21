import { createAlarms, installAlarms } from "./api/alarms";
import { createCommands } from "./api/commands";
import { createContextMenus } from "./api/context-menus";
import { installNativeMessaging } from "./api/native-messaging";
import { createNotifications } from "./api/notifications";
import { createPermissions } from "./api/permissions";
import { createPrivacy } from "./api/privacy";
import { createTabs } from "./api/tabs";
import { createWebNavigation } from "./api/web-navigation";
import { createWebRequest } from "./api/web-request";
import { createWindows } from "./api/windows";
import type { ChromeNamespace } from "./lib/chrome";
import { defineMember, fillMissing } from "./lib/fill";

/**
 * Everything the facade has to offer, built without looking at what Electron
 * implements: noop namespaces for what Electron is missing entirely, the odd
 * member for a namespace it ships half-finished, and — for `alarms` and
 * `permissions` — a real implementation backed by the embedder's bridge.
 * Promoting a namespace to one of those does not change where the facade is
 * installed, only whether it is filled in around or taken over;
 * `installChromeFacade` holds that list.
 */
export function createChromeFacade({
  opensExtensionWindows = false,
  deliversNavigationEvents = false,
} = {}): ChromeNamespace {
  return {
    alarms: createAlarms(),
    commands: createCommands(),
    contextMenus: createContextMenus(),
    notifications: createNotifications(),
    permissions: createPermissions(),
    privacy: createPrivacy(),
    tabs: createTabs(),
    webNavigation: createWebNavigation({ deliversNavigationEvents }),
    webRequest: createWebRequest(),
    windows: createWindows({ opensExtensionWindows }),
  };
}

/**
 * Completes an extension API object in place — the `chrome` object of a service
 * worker, a popup, an options page, any `chrome-extension://` frame. Almost
 * nothing native is replaced or wrapped: every namespace and member Electron
 * implements is left exactly as it is, and only the gaps around it are filled
 * (see the noop-first decision in the feature docs).
 *
 * Three namespaces are the exception, and they are because filling gaps cannot
 * help there: Electron implements `connectNative` and refuses every host from
 * it (`api/native-messaging.ts`), it implements `alarms` and delivers
 * `onAlarm` nowhere a background handler can hear it (`api/alarms.ts`), and
 * Chromium's own `permissions` answers from grants Meru never makes and
 * refuses every `request` outside a user gesture, which a worker never has
 * (`api/permissions.ts`). All three are taken over rather than filled, which
 * is why `alarms` and `permissions` are lifted out of the fill below — they are
 * real implementations and not gaps to leave alone.
 *
 * `permissions` is defined whether or not the context has one, because the
 * facade reaches no content script — only the runtime proxy's shim rides in
 * one — so it cannot put a namespace where Chrome exposes none.
 */
export function installChromeFacade(
  extensionApi: ChromeNamespace,
  { opensExtensionWindows = false, deliversNavigationEvents = false } = {},
) {
  const { alarms, permissions, ...fillableFacade } = createChromeFacade({
    opensExtensionWindows,
    deliversNavigationEvents,
  });

  fillMissing(extensionApi, fillableFacade);

  installNativeMessaging(extensionApi);

  installAlarms(extensionApi, alarms as ChromeNamespace);

  defineMember(extensionApi, "permissions", permissions);
}
