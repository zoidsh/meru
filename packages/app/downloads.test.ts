import { beforeEach, describe, expect, mock, test } from "bun:test";

const openPath = mock((_path: string) => Promise.resolve(""));

const showItemInFolder = mock((_path: string) => {});

const electron = { shell: { openPath, showItemInFolder } };

mock.module("@electron-toolkit/utils", () => ({
  platform: { isMacOS: false, isWindows: false, isLinux: true },
}));

mock.module("electron", () => ({ ...electron, default: electron }));

type ElectronDlOptions = { onStarted: (item: Electron.DownloadItem) => void };

const electronDl = mock((_options: ElectronDlOptions) => {});

mock.module("electron-dl", () => ({ default: electronDl }));

const store: Record<string, unknown> = { "downloads.history": [] };

mock.module("@/config", () => ({
  config: {
    get: (key: string) => store[key],
    set: (key: string, value: unknown) => {
      store[key] = value;
    },
  },
}));

const createNotification = mock((_options: { title: string }) => {});

mock.module("@/notifications", () => ({ createNotification }));

mock.module("./lib/fs", () => ({ fileExists: async () => true }));

mock.module("./lib/log", () => ({ log: { error: () => {} } }));

mock.module("./lib/popup", () => ({ Popup: class {} }));

mock.module("./lib/quarantine", () => ({ quarantineFile: async () => {} }));

const { downloads } = await import("./downloads");

downloads.init();

const onStarted = electronDl.mock.calls[0]?.[0].onStarted;

/** Runs a download through the app's listener, to the state it finished in. */
async function finishDownload(state: string, savePath: string) {
  let done: ((event: unknown, state: string) => Promise<void>) | undefined;

  onStarted?.({
    getSavePath: () => savePath,
    getStartTime: () => 1,
    once: (_event: string, listener: typeof done) => {
      done = listener;
    },
  } as unknown as Electron.DownloadItem);

  await done?.({}, state);
}

beforeEach(() => {
  store["downloads.history"] = [];
  store["downloads.openFolderWhenDone"] = false;
  store["notifications.downloadCompleted"] = true;
  store["notifications.onClickDownloadCompleted"] = "openFile";
  createNotification.mockClear();
});

describe("the download notification", () => {
  test.each(["report\\x41.pdf", "report\\u0041.pdf", "a$&b.pdf", "$`$'$$.pdf"])(
    "names %s as it was saved",
    async (fileName) => {
      await finishDownload("completed", `/downloads/${fileName}`);

      expect(createNotification.mock.calls[0]?.[0].title).toBe(`Downloaded ${fileName}`);
    },
  );
});
