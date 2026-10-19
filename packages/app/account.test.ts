import { beforeEach, describe, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { GOOGLE_MEET_URL } from "@meru/shared/constants";
import type { AccountConfig } from "@meru/shared/schemas";
import type { SelectedDesktopSource } from "@meru/shared/types";

type DisplayMediaCallback = (streams: { video?: SelectedDesktopSource }) => void;

type DisplayMediaRequestHandler = (request: unknown, callback: DisplayMediaCallback) => void;

class FakePickerWindow extends EventEmitter {
  webContents = {};

  focused = 0;

  destroyed = false;

  focus() {
    this.focused += 1;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    this.emit("closed");
  }
}

const ipcMain = new EventEmitter();

const displayMediaRequestHandlers = new Map<string, DisplayMediaRequestHandler>();

let pickerWindows: FakePickerWindow[] = [];

mock.module("@electron-toolkit/utils", () => ({ platform: { isMacOS: false } }));

mock.module("electron", () => ({
  app: { getLocale: () => "en-US" },
  ipcMain,
  session: {
    fromPartition: (partition: string) => ({
      setPermissionRequestHandler: () => {},
      setPermissionCheckHandler: () => {},
      setDisplayMediaRequestHandler: (handler: DisplayMediaRequestHandler) => {
        displayMediaRequestHandlers.set(partition, handler);
      },
      on: () => {},
    }),
  },
}));

mock.module("./blocker", () => ({ blocker: { setupSession: () => {} } }));

mock.module("./config", () => ({ config: { get: () => false } }));

mock.module("./extensions", () => ({
  EXTENSION_PAGE_PERMISSIONS: new Set(),
  extensions: { setupSession: async () => {} },
}));

mock.module("./gmail", () => ({ Gmail: class {} }));

mock.module("./lib/log", () => ({ log: { error: () => {} } }));

mock.module("./lib/window", () => ({
  createBrowserWindow: () => {
    const pickerWindow = new FakePickerWindow();

    pickerWindows.push(pickerWindow);

    return pickerWindow;
  },
  getPreloadPath: () => "",
  loadRenderer: () => {},
}));

mock.module("./license-key", () => ({ licenseKey: { isValid: false } }));

mock.module("./main", () => ({ main: {} }));

mock.module("./notifications", () => ({ areWorkspaceAppNotificationsAllowed: () => false }));

mock.module("./tabs", () => ({
  Tabs: class {
    tabs = [];

    restoreSavedTabs() {}
  },
}));

mock.module("./workspace-app", () => ({
  WorkspaceApp: class {
    static getAccountWindowedInstances() {
      return [{ view: { webContents: { getURL: () => GOOGLE_MEET_URL } }, window: {} }];
    }
  },
}));

const { Account } = await import("./account");

function createAccount(id: string) {
  const account = new Account({
    id,
    gmail: {},
    workspaceApps: { savedTabs: [] },
  } as unknown as AccountConfig);

  const handler = displayMediaRequestHandlers.get(`persist:${id}`);

  if (!handler) {
    throw new Error(`No display media request handler for ${id}`);
  }

  const requestDisplayMedia = () => {
    const answers: Array<{ video?: SelectedDesktopSource }> = [];

    handler({}, (streams) => {
      answers.push(streams);
    });

    return answers;
  };

  return { account, requestDisplayMedia };
}

function openedPicker(index: number) {
  const pickerWindow = pickerWindows[index];

  if (!pickerWindow) {
    throw new Error(`No picker window at ${index}`);
  }

  return pickerWindow;
}

function pick(pickerWindow: FakePickerWindow, desktopSource: SelectedDesktopSource) {
  ipcMain.emit("desktopSources.select", { sender: pickerWindow.webContents }, desktopSource);
}

const screen = { id: "screen:1:0" } as SelectedDesktopSource;

const window = { id: "window:42:0" } as SelectedDesktopSource;

beforeEach(() => {
  pickerWindows = [];

  displayMediaRequestHandlers.clear();

  ipcMain.removeAllListeners();
});

describe("display media requests", () => {
  test("answer with the source picked in the picker", () => {
    const { account, requestDisplayMedia } = createAccount("a");

    const answers = requestDisplayMedia();

    pick(openedPicker(0), screen);

    expect(answers).toEqual([{ video: screen }]);
    expect(openedPicker(0).destroyed).toBe(true);
    expect(account.desktopSourcesWindow).toBeNull();
    expect(ipcMain.listenerCount("desktopSources.select")).toBe(0);
  });

  test("answer with nothing when the picker closes without a pick", () => {
    const { account, requestDisplayMedia } = createAccount("a");

    const answers = requestDisplayMedia();

    openedPicker(0).emit("closed");

    expect(answers).toEqual([{}]);
    expect(account.desktopSourcesWindow).toBeNull();
    expect(ipcMain.listenerCount("desktopSources.select")).toBe(0);
  });

  test("ignore a pick from another window", () => {
    const { requestDisplayMedia } = createAccount("a");

    const answers = requestDisplayMedia();

    ipcMain.emit("desktopSources.select", { sender: {} }, screen);

    expect(answers).toEqual([]);
    expect(openedPicker(0).destroyed).toBe(false);
  });

  test("keep two accounts' pickers apart", () => {
    const first = createAccount("a");
    const second = createAccount("b");

    const firstAnswers = first.requestDisplayMedia();
    const secondAnswers = second.requestDisplayMedia();

    const firstPicker = openedPicker(0);
    const secondPicker = openedPicker(1);

    pick(secondPicker, window);

    expect(firstAnswers).toEqual([]);
    expect(secondAnswers).toEqual([{ video: window }]);
    expect(firstPicker.destroyed).toBe(false);
    expect(secondPicker.destroyed).toBe(true);

    pick(firstPicker, screen);

    expect(firstAnswers).toEqual([{ video: screen }]);
    expect(secondAnswers).toEqual([{ video: window }]);
  });

  test("bring the open picker to the front and decline a second request from the same account", () => {
    const { account, requestDisplayMedia } = createAccount("a");

    const firstAnswers = requestDisplayMedia();
    const secondAnswers = requestDisplayMedia();

    expect(pickerWindows).toHaveLength(1);
    expect(openedPicker(0).focused).toBe(1);
    expect(secondAnswers).toEqual([{}]);
    expect(firstAnswers).toEqual([]);

    pick(openedPicker(0), screen);

    expect(firstAnswers).toEqual([{ video: screen }]);
    expect(secondAnswers).toEqual([{}]);
    expect(account.desktopSourcesWindow).toBeNull();
  });

  test("open a new picker once the previous one has closed", () => {
    const { requestDisplayMedia } = createAccount("a");

    requestDisplayMedia();

    openedPicker(0).emit("closed");

    const answers = requestDisplayMedia();

    expect(pickerWindows).toHaveLength(2);

    pick(openedPicker(1), screen);

    expect(answers).toEqual([{ video: screen }]);
  });
});
