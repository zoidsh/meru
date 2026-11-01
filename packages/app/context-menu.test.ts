import { describe, expect, mock, test } from "bun:test";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

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

mock.module("./accounts", () => ({
  accounts: {
    getSelectedAccount: () => ({ instance: { gmail: { view: gmailView } } }),
  },
}));

mock.module("./lib/clipboard", () => ({ copyText: () => {} }));

mock.module("./lib/deep-link", () => ({ createMeruMessageUrl: () => "" }));

mock.module("./license-key", () => ({ licenseKey: { isValid: true } }));

mock.module("./url", () => ({ openExternalUrl: () => {} }));

const { setupWindowContextMenu } = await import("./context-menu");

function openContextMenu(parameters: Record<string, unknown>) {
  let handleContextMenu!: (event: unknown, parameters: unknown) => void;

  const view = {
    webContents: {
      getURL: () => "https://docs.google.com/document/d/1",
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

  // A single `&` marks the access key and `&&` is a literal ampersand, as Electron reads them.
  return template.flatMap(({ label }) => (label ? [label.replaceAll(/&(.)/g, "$1")] : []));
}

describe("context menu in a Workspace app view", () => {
  test("gives every item on a link its own label", () => {
    const labels = openContextMenu({
      linkText: "Example",
      linkURL: "https://example.com/",
    });

    expect(labels).toContain("Copy Link");
    expect(labels.filter((label, index) => labels.indexOf(label) !== index)).toEqual([]);
  });
});
