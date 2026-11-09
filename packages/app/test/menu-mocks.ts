import { mock } from "bun:test";
import type { MenuItemConstructorOptions } from "electron";

export type PlatformContext = "macOS" | "Windows" | "Linux";

export const PLATFORM_CONTEXTS: PlatformContext[] = ["macOS", "Windows", "Linux"];

const platform = { isMacOS: false, isWindows: false, isLinux: false };

export function setPlatform(context: PlatformContext) {
  platform.isMacOS = context === "macOS";
  platform.isWindows = context === "Windows";
  platform.isLinux = context === "Linux";
}

/** The template of the menu built last. */
export const built: { template: MenuItemConstructorOptions[] } = { template: [] };

export const gmailView = { webContents: { getURL: () => "https://mail.google.com/mail/u/0/" } };

export const gmail: { userEmail: string | undefined; messageId: string | undefined } = {
  userEmail: undefined,
  messageId: undefined,
};

export const licenseKey = { isValid: false };

type ContextMenuListener = (event: unknown, parameters: unknown) => void;

/** The template a right-click on `view` builds, through the listener the view was given. */
export function rightClick(
  setupWindowContextMenu: (view: never) => void,
  view: { webContents: object },
  parameters: Record<string, unknown>,
) {
  let listener: ContextMenuListener | undefined;

  Object.assign(view.webContents, {
    on: (event: string, handler: ContextMenuListener) => {
      if (event === "context-menu") {
        listener = handler;
      }
    },
    once: () => {},
  });

  setupWindowContextMenu(view as never);

  built.template = [];

  listener?.(
    {},
    {
      selectionText: "",
      isEditable: false,
      linkURL: "",
      linkText: "",
      mediaType: "none",
      srcURL: "",
      misspelledWord: "",
      dictionarySuggestions: [],
      x: 0,
      y: 0,
      editFlags: { canCut: true, canCopy: true, canPaste: true },
      ...parameters,
    },
  );

  return built.template;
}

/*
 * Stands in for Electron and for every module the application menu, the tray
 * and the context menu import, so each builds its template without an app.
 * Call it before importing any of them.
 */
export function mockMenuDependencies() {
  mock.module("@electron-toolkit/utils", () => ({ is: { dev: false }, platform }));

  const electronApp = { name: "Meru", on: () => {} };

  const electronMenu = {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => {
      built.template = template;

      return { on: () => {}, popup: () => {} };
    },
    setApplicationMenu: () => {},
  };

  const electronBrowserWindow = { getFocusedWindow: () => null, getAllWindows: () => [] };

  mock.module("electron", () => ({
    default: { app: electronApp, BrowserWindow: electronBrowserWindow, Menu: electronMenu },
    app: electronApp,
    BrowserWindow: electronBrowserWindow,
    dialog: {},
    Menu: electronMenu,
    nativeTheme: {},
    shell: {},
  }));

  const gmailTab = { id: "gmail", pinned: true };

  mock.module("@/accounts", () => ({
    accounts: {
      getAccounts: () => [],
      getSelectedAccount: () => ({
        instance: {
          tabs: { activeTab: gmailTab, activeTabId: gmailTab.id },
          gmail: {
            get userEmail() {
              return gmail.userEmail;
            },
            get messageId() {
              return gmail.messageId;
            },
            view: gmailView,
          },
        },
      }),
    },
  }));

  mock.module("@/active-view", () => ({ getActiveView: () => ({}) }));

  mock.module("@/config", () => ({ config: { get: () => false, onDidChange: () => {} } }));

  mock.module("@/dialogs", () => ({ showRestartDialog: () => {} }));

  mock.module("@/downloads", () => ({ downloads: {} }));

  mock.module("@/ipc", () => ({ ipc: {} }));

  mock.module("@/lib/clipboard", () => ({ copyBookmark: () => {}, copyText: () => {} }));

  mock.module("@/lib/log", () => ({ log: {} }));

  mock.module("@/lib/relaunch", () => ({ relaunchApp: () => {} }));

  mock.module("@/main", () => ({ main: { window: { isVisible: () => true }, location: "/" } }));

  mock.module("@/settings-window", () => ({ settingsWindow: {} }));

  mock.module("@/updater", () => ({ appUpdater: { isUpdateSupported: () => true } }));

  mock.module("@/url", () => ({ openExternalUrl: () => {} }));

  mock.module("@/workspace-app", () => ({
    WorkspaceApp: class {
      static tryFromWebContents() {
        return undefined;
      }
    },
  }));

  mock.module("@/lib/deep-link", () => ({ createMeruMessageUrl: () => "meru://message" }));

  mock.module("@/license-key", () => ({ licenseKey }));
}
