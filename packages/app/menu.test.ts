import { describe, expect, mock, test } from "bun:test";
import { GMAIL_TAB_ID } from "@meru/shared/tabs";
import type { MenuItemConstructorOptions } from "electron";

const currentPlatform = { isMacOS: false, isWindows: false, isLinux: false };

mock.module("@electron-toolkit/utils", () => ({ is: { dev: false }, platform: currentPlatform }));

let template: MenuItemConstructorOptions[] = [];

const mainWindow = { webContents: {} };

const electron = {
  app: { name: "Meru", on: () => {}, quit: () => {} },
  BrowserWindow: { getFocusedWindow: () => mainWindow },
  dialog: {},
  Menu: {
    buildFromTemplate: (items: MenuItemConstructorOptions[]) => {
      template = items;

      return { on: () => {} };
    },
  },
  shell: {},
};

mock.module("electron", () => ({ ...electron, default: electron }));

const gmail: { userEmail?: string; messageId?: string; view: { webContents: object } } = {
  view: { webContents: {} },
};

const selectedAccount = {
  config: { id: "account", label: "Account" },
  instance: { gmail, tabs: { activeTab: { id: GMAIL_TAB_ID, pinned: true } } },
};

mock.module("@/accounts", () => ({
  accounts: {
    getAccounts: () => [selectedAccount],
    getSelectedAccount: () => selectedAccount,
  },
}));

mock.module("@/active-view", () => ({ getActiveView: () => ({}) }));

mock.module("@/config", () => ({ config: { get: () => false, onDidChange: () => {} } }));

mock.module("@/dialogs", () => ({ showRestartDialog: () => {} }));

mock.module("@/downloads", () => ({ downloads: {} }));

mock.module("@/ipc", () => ({ ipc: {} }));

mock.module("@/lib/clipboard", () => ({ copyText: () => {} }));

mock.module("@/lib/log", () => ({ log: {} }));

mock.module("@/lib/relaunch", () => ({ relaunchApp: () => {} }));

mock.module("@/main", () => ({ main: { location: "/", window: mainWindow } }));

mock.module("@/updater", () => ({ appUpdater: { isUpdateSupported: () => true } }));

mock.module("@/url", () => ({ openExternalUrl: () => {} }));

mock.module("@/workspace-app", () => ({
  WorkspaceApp: class {
    static tryFromWebContents() {
      return undefined;
    }
  },
}));

mock.module("./lib/deep-link", () => ({
  createMeruMessageUrl: () => "meru://message",
}));

mock.module("./license-key", () => ({ licenseKey: { isValid: true } }));

const { AppMenu } = await import("./menu");

function buildMessageMenu({
  platform,
  isMessageOpen,
}: {
  platform: "isMacOS" | "isWindows" | "isLinux";
  isMessageOpen: boolean;
}) {
  currentPlatform.isMacOS = platform === "isMacOS";
  currentPlatform.isWindows = platform === "isWindows";
  currentPlatform.isLinux = platform === "isLinux";

  gmail.userEmail = isMessageOpen ? "user@example.com" : undefined;
  gmail.messageId = isMessageOpen ? "message" : undefined;

  new AppMenu().createMenu();

  const messageMenu = template.find(({ label }) => label === "Message");

  return messageMenu?.submenu as MenuItemConstructorOptions[];
}

function isShareItem(item: MenuItemConstructorOptions) {
  return item.role === "shareMenu" || item.label === "Share";
}

describe("Message menu", () => {
  for (const isMessageOpen of [true, false]) {
    const state = isMessageOpen ? "with a message open" : "with no message open";

    for (const platform of ["isWindows", "isLinux"] as const) {
      test(`has no Share item on ${platform.slice(2)} ${state}`, () => {
        const items = buildMessageMenu({ platform, isMessageOpen });

        expect(items.filter(isShareItem)).toEqual([]);
        expect(items.at(0)?.type).not.toBe("separator");
        expect(items.at(-1)?.type).not.toBe("separator");
      });
    }

    test(`has a Share item on macOS ${state}`, () => {
      const items = buildMessageMenu({ platform: "isMacOS", isMessageOpen });

      expect(items.filter(isShareItem)).toHaveLength(1);
    });
  }

  test("shares the message link on macOS", () => {
    const items = buildMessageMenu({ platform: "isMacOS", isMessageOpen: true });

    expect(items.find(isShareItem)).toMatchObject({
      role: "shareMenu",
      sharingItem: { urls: ["meru://message"] },
    });
  });
});
