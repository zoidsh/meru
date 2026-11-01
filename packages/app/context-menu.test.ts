import { describe, expect, mock, test } from "bun:test";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

const currentPlatform = { isMacOS: false, isWindows: false, isLinux: false };

mock.module("@electron-toolkit/utils", () => ({ platform: currentPlatform }));

let template: MenuItemConstructorOptions[] = [];

const electron = {
  app: { isPackaged: true, on: () => {} },
  BrowserWindow: { getAllWindows: () => [] },
  clipboard: {},
  dialog: {},
  Menu: {
    buildFromTemplate: (items: MenuItemConstructorOptions[]) => {
      template = items;

      return { on: () => {}, popup: () => {} };
    },
  },
  shell: {},
};

mock.module("electron", () => ({ ...electron, default: electron }));

const gmailView = { webContents: { getURL: () => "https://mail.google.com/mail/u/0/" } };

const gmail = { messageId: "message", userEmail: "user@example.com", view: gmailView };

mock.module("./accounts", () => ({
  accounts: {
    getSelectedAccount: () => ({ instance: { gmail } }),
  },
}));

mock.module("./lib/clipboard", () => ({ copyText: () => {} }));

mock.module("./lib/deep-link", () => ({ createMeruMessageUrl: () => "meru://message" }));

mock.module("./license-key", () => ({ licenseKey: { isValid: true } }));

mock.module("./url", () => ({ openExternalUrl: () => {} }));

const { setupWindowContextMenu } = await import("./context-menu");

function openContextMenuItems(
  parameters: Record<string, unknown>,
  pageURL = "https://docs.google.com/document/d/1",
) {
  let handleContextMenu!: (event: unknown, parameters: unknown) => void;

  const view = {
    webContents: {
      getURL: () => pageURL,
      on: (event: string, listener: typeof handleContextMenu) => {
        if (event === "context-menu") {
          handleContextMenu = listener;
        }
      },
      once: () => {},
    },
  };

  setupWindowContextMenu(view as unknown as BrowserWindow);

  handleContextMenu(
    {},
    {
      editFlags: {},
      isEditable: false,
      linkText: "",
      linkURL: "",
      mediaType: "none",
      misspelledWord: "",
      pageURL: view.webContents.getURL(),
      selectionText: "",
      x: 0,
      y: 0,
      ...parameters,
    },
  );

  return template;
}

function openContextMenu(parameters: Record<string, unknown>) {
  // A single `&` marks the access key and `&&` is a literal ampersand, as Electron reads them.
  return openContextMenuItems(parameters).flatMap(({ label }) =>
    label ? [label.replaceAll(/&(.)/g, "$1")] : [],
  );
}

describe("context menu in a Workspace app view", () => {
  test("gives every item on a link its own label", () => {
    const labels = openContextMenu({
      linkText: "Example",
      linkURL: "https://example.com/",
    });

    expect(labels).toContain("Copy Link Address");
    expect(labels).toContain("Copy URL");
    expect(labels.filter((label, index) => labels.indexOf(label) !== index)).toEqual([]);
  });
});

describe("context menu on an open Gmail message", () => {
  function openOn(platform: "isMacOS" | "isWindows" | "isLinux") {
    currentPlatform.isMacOS = platform === "isMacOS";
    currentPlatform.isWindows = platform === "isWindows";
    currentPlatform.isLinux = platform === "isLinux";

    return openContextMenuItems({}, gmailView.webContents.getURL());
  }

  for (const platform of ["isWindows", "isLinux"] as const) {
    test(`has no Share item on ${platform.slice(2)}`, () => {
      const items = openOn(platform);

      expect(items.map(({ label }) => label)).toContain("Copy Message Link");
      expect(items.filter(({ role }) => role === "shareMenu")).toEqual([]);
      expect(
        items.filter(
          ({ type }, index) => type === "separator" && items[index + 1]?.type === "separator",
        ),
      ).toEqual([]);
    });
  }

  test("has a Share item for the message link on macOS", () => {
    expect(openOn("isMacOS").filter(({ role }) => role === "shareMenu")).toEqual([
      { role: "shareMenu", sharingItem: { urls: ["meru://message"] } },
    ]);
  });
});
