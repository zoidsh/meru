/**
 * What the driver and the probe extension's contexts both read: the members an
 * inventory covers and the shapes reported back. Kept free of the build-time
 * constants `chrome.ts` reads, so the driver can import it.
 */

/** Every namespace the conformance table has a row for, in its order. */
export const NAMESPACES = [
  "accessibilityFeatures",
  "action",
  "alarms",
  "audio",
  "bookmarks",
  "browsingData",
  "certificateProvider",
  "commands",
  "contentSettings",
  "contextMenus",
  "cookies",
  "debugger",
  "declarativeContent",
  "declarativeNetRequest",
  "desktopCapture",
  "devtools.inspectedWindow",
  "devtools.network",
  "devtools.panels",
  "devtools.performance",
  "devtools.recorder",
  "dns",
  "dom",
  "downloads",
  "enterprise.deviceAttributes",
  "enterprise.hardwarePlatform",
  "enterprise.login",
  "enterprise.networkingAttributes",
  "enterprise.platformKeys",
  "events",
  "extension",
  "extensionTypes",
  "fileBrowserHandler",
  "fileSystemProvider",
  "fontSettings",
  "gcm",
  "history",
  "i18n",
  "identity",
  "idle",
  "input.ime",
  "instanceID",
  "loginState",
  "management",
  "mimeHandler",
  "notifications",
  "offscreen",
  "omnibox",
  "pageCapture",
  "permissions",
  "platformKeys",
  "power",
  "printerProvider",
  "printing",
  "printingMetrics",
  "privacy",
  "processes",
  "proxy",
  "publicSuffix",
  "readingList",
  "runtime",
  "scripting",
  "search",
  "sessions",
  "sidePanel",
  "storage",
  "system.cpu",
  "system.display",
  "system.memory",
  "system.storage",
  "systemLog",
  "tabCapture",
  "tabGroups",
  "tabs",
  "topSites",
  "tts",
  "ttsEngine",
  "types",
  "userScripts",
  "vpnProvider",
  "wallpaper",
  "webAuthenticationProxy",
  "webNavigation",
  "webRequest",
  "windows",
];

const TABS_EVENTS = [
  "onActivated",
  "onAttached",
  "onCreated",
  "onDetached",
  "onHighlighted",
  "onMoved",
  "onRemoved",
  "onReplaced",
  "onUpdated",
  "onZoomChange",
];

const MANAGEMENT_MEMBERS = [
  "createAppShortcut",
  "generateAppForLink",
  "get",
  "getAll",
  "getPermissionWarningsById",
  "getPermissionWarningsByManifest",
  "getSelf",
  "installReplacementWebApp",
  "launchApp",
  "setEnabled",
  "setLaunchType",
  "uninstall",
  "uninstallSelf",
  "onDisabled",
  "onEnabled",
  "onInstalled",
  "onUninstalled",
];

const WEB_REQUEST_EVENTS = [
  "onActionIgnored",
  "onAuthRequired",
  "onBeforeRedirect",
  "onBeforeRequest",
  "onBeforeSendHeaders",
  "onCompleted",
  "onErrorOccurred",
  "onHeadersReceived",
  "onResponseStarted",
  "onSendHeaders",
];

/** The members below a namespace whose presence the table's notes turn on. */
export const MEMBERS = [
  "storage.local",
  "storage.sync",
  "storage.session",
  "storage.managed",
  "storage.onChanged",
  "runtime.getContexts",
  ...TABS_EVENTS.map((event) => `tabs.${event}`),
  ...MANAGEMENT_MEMBERS.map((member) => `management.${member}`),
  ...WEB_REQUEST_EVENTS.map((event) => `webRequest.${event}`),
];

export const ALARM_DELAY_SECONDS = 6;

/** The test page a window loads, which the content scripts match. */
export const PAGE_PATH = "/page";

/** What the worker fetches for `webRequest` to see. */
export const WORKER_FETCH_PATH = "/worker-fetch";

/** A call's outcome as a context reports it. */
export type Settled<T> = { value?: T; error?: string };

export type MemberCall = { member: string; args: unknown[] };

/**
 * One member called on each namespace that is present without anything else
 * here exercising it, since presence alone says nothing about whether Electron
 * answers it. Made in the worker, in this order.
 *
 * `system.storage.getInfo()` is left out on purpose: it takes the whole browser
 * down (exit 139, on 44.9.3 and 45.1.0 alike), and every measurement after it
 * would go with it. `printerProvider` has only events, which no call fires.
 */
export const WORKER_CALLS: MemberCall[] = [
  { member: "dns.resolve", args: ["localhost"] },
  { member: "power.requestKeepAwake", args: ["system"] },
  { member: "power.releaseKeepAwake", args: [] },
  { member: "power.reportActivity", args: [] },
  { member: "system.cpu.getInfo", args: [] },
  { member: "system.memory.getInfo", args: [] },
  { member: "system.display.getInfo", args: [] },
  { member: "proxy.settings.get", args: [{}] },
];

export type RegisteredContentScript = { id: string; persistAcrossSessions?: boolean };

export type Context = "worker" | "page" | "content";

/** `typeof` of each member, keyed by its dotted path below `chrome`. */
export type Inventory = Record<string, string>;
