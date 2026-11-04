import { afterEach, beforeEach, describe, expect, jest, mock, test } from "bun:test";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { i18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { ms } from "@meru/shared/ms";
import type { DownloadItem } from "@meru/shared/types";
import type { BrowserWindow, MenuItemConstructorOptions } from "electron";

const currentPlatform = { isMacOS: false, isWindows: false, isLinux: true };

mock.module("@electron-toolkit/utils", () => ({ platform: currentPlatform }));

const fakeWindow = {
  isDestroyed: () => false,
  setProgressBar: mock((_progress: number) => {}),
};

let mainWindow: typeof fakeWindow | undefined = fakeWindow;

mock.module("@/main", () => ({
  main: {
    get windowIfCreated() {
      return mainWindow;
    },
  },
}));

const sessionCreatedListeners: ((session: FakeSession) => void)[] = [];

const dockBadges = mock((_badge: string) => {});

const downloadFinished = mock((_path: string) => {});

const badgeCounts = mock((_count: number) => {});

const electronApp = {
  dock: { downloadFinished, setBadge: dockBadges },
  on(event: string, listener: (session: FakeSession) => void) {
    if (event === "session-created") {
      sessionCreatedListeners.push(listener);
    }
  },
  set badgeCount(count: number) {
    badgeCounts(count);
  },
};

const openPath = mock((_path: string) => Promise.resolve(""));

const showItemInFolder = mock((_path: string) => {});

const showErrorBox = mock((_title: string, _content: string) => {});

let template: MenuItemConstructorOptions[] = [];

const electron = {
  app: electronApp,
  BrowserWindow: {
    fromWebContents(webContents: unknown) {
      if (!webContents) {
        throw new TypeError("Error processing argument at index 0");
      }

      return mainWindow ?? null;
    },
  },
  dialog: { showErrorBox },
  Menu: {
    buildFromTemplate(items: MenuItemConstructorOptions[]) {
      template = items;

      return { popup: () => {} };
    },
  },
  shell: { openPath, showItemInFolder },
};

mock.module("electron", () => ({ ...electron, default: electron }));

const store: Record<string, unknown> = {};

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

const logError = mock((..._arguments: unknown[]) => {});

mock.module("./lib/log", () => ({ log: { error: logError } }));

mock.module("./lib/popup", () => ({ Popup: class {} }));

const quarantineFile = mock((_path: string) => Promise.resolve());

mock.module("./lib/quarantine", () => ({ quarantineFile }));

mock.module("./accounts", () => ({
  accounts: { getSelectedAccount: () => ({ instance: { gmail: { view: {} } } }) },
}));

mock.module("./lib/clipboard", () => ({ copyBookmark: () => {}, copyText: () => {} }));

mock.module("./lib/deep-link", () => ({ createMeruMessageUrl: () => "" }));

mock.module("./license-key", () => ({ licenseKey: { isValid: false } }));

mock.module("./url", () => ({ openExternalUrl: () => {} }));

const { downloads } = await import("./downloads");

const { setupWindowContextMenu } = await import("./context-menu");

class FakeSession extends EventEmitter {}

type FakeItemOptions = {
  filename?: string;
  mimeType?: string;
  totalBytes?: number;
  urlChain?: string[];
};

class FakeItem extends EventEmitter {
  savePath = "";
  dialogOptions: { defaultPath?: string } | undefined;
  state = "progressing";
  receivedBytes = 0;
  resumable = false;

  constructor(private readonly options: FakeItemOptions) {
    super();
  }

  getFilename = () => this.options.filename ?? "report.pdf";
  getMimeType = () => this.options.mimeType ?? "application/octet-stream";
  getTotalBytes = () => this.options.totalBytes ?? 0;
  getReceivedBytes = () => this.receivedBytes;
  getURL = () => this.options.urlChain?.at(-1) ?? "https://example.com/file";
  getURLChain = () => this.options.urlChain ?? ["https://example.com/file"];
  getStartTime = () => 1;
  getState = () => this.state;
  getSavePath = () => this.savePath;
  canResume = () => this.resumable;

  setSavePath(savePath: string) {
    this.savePath = savePath;
  }

  setSaveDialogOptions(options: { defaultPath?: string }) {
    this.dialogOptions = options;
  }

  cancel = mock(() => {
    this.finish("cancelled");
  });

  /** A progress notification, as Chromium sends it. */
  progress(receivedBytes: number) {
    this.receivedBytes = receivedBytes;

    this.emit("updated", {}, "progressing");
  }

  /** A dropped connection: Chromium keeps the item resumable and sends no `done`. */
  drop() {
    this.state = "interrupted";
    this.resumable = true;

    this.emit("updated", {}, "interrupted");
  }

  finish(state: string) {
    if (state === "completed") {
      this.receivedBytes = this.getTotalBytes();
    }

    this.state = state;
    this.resumable = false;

    this.emit("done", {}, state);
  }
}

let location: string;

let session: FakeSession;

let startedItems: FakeItem[] = [];

const WEB_CONTENTS = { id: 1 };

/** What Electron does when a session sees a download. */
function arrive(
  options: FakeItemOptions = {},
  { from = session, webContents = WEB_CONTENTS as unknown } = {},
) {
  const item = new FakeItem(options);

  startedItems.push(item);

  from.emit("will-download", {}, item, webContents);

  return item;
}

function createSession() {
  const created = new FakeSession();

  for (const listener of sessionCreatedListeners) {
    listener(created);
  }

  return created;
}

/** Starts the app's download handling over, reading the settings as they stand. */
function initDownloads(settings: Record<string, unknown> = {}) {
  Object.assign(store, settings);

  sessionCreatedListeners.length = 0;

  downloads.init();

  session = createSession();
}

function history() {
  return store["downloads.history"] as DownloadItem[];
}

function historyNames() {
  return history().map(({ fileName }) => fileName);
}

function progressValues() {
  return fakeWindow.setProgressBar.mock.calls.map(([progress]) => progress);
}

/** Past what a download's listeners defer to a later task, which `Bun.sleep(0)` can overtake. */
const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(() => {
  location = mkdtempSync(path.join(tmpdir(), "meru-downloads-test-"));

  mainWindow = fakeWindow;

  startedItems = [];

  store["downloads.history"] = [];
  store["downloads.openFolderWhenDone"] = false;
  store["notifications.downloadCompleted"] = true;
  store["notifications.onClickDownloadCompleted"] = "openFile";

  initDownloads({ "downloads.saveAs": false, "downloads.location": location });

  currentPlatform.isMacOS = false;
  currentPlatform.isLinux = true;

  for (const fake of [
    badgeCounts,
    createNotification,
    dockBadges,
    downloadFinished,
    fakeWindow.setProgressBar,
    logError,
    openPath,
    quarantineFile,
    showErrorBox,
    showItemInFolder,
  ]) {
    fake.mockClear();
  }
});

afterEach(async () => {
  jest.useRealTimers();

  for (const item of startedItems) {
    if (item.state === "progressing") {
      item.finish("cancelled");
    }
  }

  await settle();

  rmSync(location, { recursive: true, force: true });
});

describe("the listener", () => {
  test("goes once on each session the app creates", () => {
    const another = createSession();

    expect(session.listenerCount("will-download")).toBe(1);
    expect(another.listenerCount("will-download")).toBe(1);
  });

  test("saves into the configured folder without asking", () => {
    const item = arrive();

    expect(item.savePath).toBe(path.join(location, "report.pdf"));
    expect(item.dialogOptions).toBeUndefined();
  });

  test("asks with the configured folder as the starting point when Save As is on", () => {
    initDownloads({ "downloads.saveAs": true });

    const item = arrive();

    expect(item.savePath).toBe("");
    expect(item.dialogOptions).toEqual({ defaultPath: path.join(location, "report.pdf") });
  });

  test("keeps the folder and the Save As setting it read when it started", () => {
    store["downloads.saveAs"] = true;
    store["downloads.location"] = "/changed/in/settings";

    const item = arrive();

    expect(item.savePath).toBe(path.join(location, "report.pdf"));
    expect(item.dialogOptions).toBeUndefined();
  });

  test("never throws on a download with no web contents", () => {
    expect(() => arrive({}, { webContents: null })).not.toThrow();
  });

  test("never throws on a download with no window to show progress on", () => {
    mainWindow = undefined;

    const item = arrive();

    expect(() => item.progress(1)).not.toThrow();
    expect(() => item.finish("completed")).not.toThrow();
  });
});

describe("the file name", () => {
  test.each([
    ["report.pdf", [], "report.pdf"],
    ["report.pdf", ["report.pdf"], "report (1).pdf"],
    ["report.pdf", ["report.pdf", "report (1).pdf"], "report (2).pdf"],
    ["report.pdf", ["report.pdf", "report (2).pdf"], "report (1).pdf"],
    ["report (1).pdf", [], "report (1).pdf"],
    ["report (1).pdf", ["report (1).pdf"], "report (2).pdf"],
    ["report(1).pdf", ["report(1).pdf"], "report (2).pdf"],
    ["report (9).pdf", ["report (9).pdf"], "report (10).pdf"],
    ["report (007).pdf", ["report (007).pdf"], "report (8).pdf"],
    ["report (1) (1).pdf", ["report (1) (1).pdf"], "report (1) (2).pdf"],
    ["report (1) .pdf", ["report (1) .pdf"], "report (1) (1).pdf"],
    ["report .pdf", ["report .pdf"], "report (1).pdf"],
    ["(1).pdf", ["(1).pdf"], " (2).pdf"],
    ["archive.tar.gz", ["archive.tar.gz"], "archive.tar (1).gz"],
    ["notes", ["notes"], "notes (1)"],
    [".bashrc", [".bashrc"], ".bashrc (1)"],
    ["report.", ["report."], "report (1)."],
  ])("%s with %j already there is saved as %s", (filename, existing, expected) => {
    for (const name of existing) {
      writeFileSync(path.join(location, name), "");
    }

    expect(arrive({ filename }).savePath).toBe(path.join(location, expected));
  });

  test("two downloads of one name at once get a path each", () => {
    const first = arrive();
    const second = arrive();
    const third = arrive();

    expect([first, second, third].map(({ savePath }) => path.basename(savePath))).toEqual([
      "report.pdf",
      "report (1).pdf",
      "report (2).pdf",
    ]);
  });

  test("two downloads of one name in different sessions get a path each", () => {
    const first = arrive();
    const second = arrive({}, { from: createSession() });

    expect(path.basename(first.savePath)).toBe("report.pdf");
    expect(path.basename(second.savePath)).toBe("report (1).pdf");
  });

  test("a path chosen in the save dialog is taken while that download runs", () => {
    initDownloads({ "downloads.saveAs": true });

    const asked = arrive({ filename: "asked.pdf" });

    asked.setSavePath(path.join(location, "chosen.pdf"));

    expect(arrive({ filename: "chosen.pdf" }).dialogOptions?.defaultPath).toBe(
      path.join(location, "chosen (1).pdf"),
    );
  });

  test.each(["completed", "cancelled", "interrupted"])(
    "a download's path is free again once it ends as %s",
    async (state) => {
      arrive().finish(state);

      await settle();

      expect(path.basename(arrive().savePath)).toBe("report.pdf");
    },
  );

  test("a dropped download's path is free again", async () => {
    arrive().drop();

    await settle();

    expect(path.basename(arrive().savePath)).toBe("report.pdf");
  });

  test("a save dialog cancelled frees the name it offered", async () => {
    initDownloads({ "downloads.saveAs": true });

    arrive().finish("cancelled");

    await settle();

    expect(arrive().dialogOptions?.defaultPath).toBe(path.join(location, "report.pdf"));
  });

  test.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/gif", "gif"],
    ["image/webp", "webp"],
    ["image/svg+xml", "svg"],
    ["image/bmp", "bmp"],
    ["image/tiff", "tiff"],
    ["image/heic", "heic"],
    ["image/avif", "avif"],
    ["image/x-icon", "ico"],
    ["application/pdf", "pdf"],
    ["text/plain", "txt"],
    ["text/html", "html"],
    ["text/css", "css"],
    ["text/csv", "csv"],
    ["application/json", "json"],
    ["application/xml", "xml"],
    ["application/rtf", "rtf"],
    ["application/msword", "doc"],
    ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["application/vnd.ms-excel", "xls"],
    ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "xlsx"],
    ["application/vnd.ms-powerpoint", "ppt"],
    ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
    ["application/vnd.oasis.opendocument.text", "odt"],
    ["application/vnd.oasis.opendocument.spreadsheet", "ods"],
    ["application/vnd.oasis.opendocument.presentation", "odp"],
    ["text/calendar", "ics"],
    ["application/zip", "zip"],
    ["application/gzip", "gz"],
    ["application/x-tar", "tar"],
    ["application/x-7z-compressed", "7z"],
    ["application/vnd.rar", "rar"],
    ["audio/mpeg", "mp3"],
    ["audio/wav", "wav"],
    ["audio/ogg", "ogg"],
    ["audio/mp4", "m4a"],
    ["video/mp4", "mp4"],
    ["video/webm", "webm"],
    ["video/quicktime", "mov"],
    ["image/jpg", "jpg"],
    ["image/vnd.microsoft.icon", "ico"],
    ["text/xml", "xml"],
    ["text/rtf", "rtf"],
    ["application/x-zip-compressed", "zip"],
    ["application/x-gzip", "gz"],
    ["application/x-rar-compressed", "rar"],
    ["audio/x-wav", "wav"],
    ["audio/x-m4a", "m4a"],
  ])("a name with no extension and the type %s gets .%s", (mimeType, extension) => {
    const item = arrive({ filename: "attachment", mimeType });

    expect(path.basename(item.savePath)).toBe(`attachment.${extension}`);
  });

  test.each(["IMAGE/JPEG", "image/jpeg; charset=binary", " Image/Jpeg ;q=1"])(
    "the type %s reads as image/jpeg",
    (mimeType) => {
      const item = arrive({ filename: "photo", mimeType });

      expect(path.basename(item.savePath)).toBe("photo.jpg");
    },
  );

  test.each(["application/octet-stream", "application/x-not-a-real-type", ""])(
    "the type %j adds no extension",
    (mimeType) => {
      const item = arrive({ filename: "attachment", mimeType });

      expect(path.basename(item.savePath)).toBe("attachment");
    },
  );

  test.each([
    ["photo.png", "image/jpeg", "photo.png"],
    ["report.", "application/pdf", "report."],
    [".profile", "text/plain", ".profile.txt"],
  ])("%s of the type %s is saved as %s", (filename, mimeType, expected) => {
    expect(path.basename(arrive({ filename, mimeType }).savePath)).toBe(expected);
  });
});

describe("the progress bar", () => {
  test("shows how far a download has come, and clears when it ends", () => {
    const item = arrive({ totalBytes: 100 });

    item.progress(25);

    expect(progressValues().at(-1)).toBe(0.25);

    item.finish("completed");

    expect(progressValues().at(-1)).toBe(-1);
  });

  test("counts downloads across sessions together", () => {
    const first = arrive({ totalBytes: 100 });
    const second = arrive({ filename: "b.pdf", totalBytes: 300 }, { from: createSession() });

    first.progress(50);

    expect(progressValues().at(-1)).toBe(50 / 400);

    second.progress(150);

    expect(progressValues().at(-1)).toBe(200 / 400);
  });

  test("clears only once the last download across sessions ends", () => {
    const first = arrive({ totalBytes: 100 });
    const second = arrive({ filename: "b.pdf", totalBytes: 100 }, { from: createSession() });

    first.finish("completed");

    expect(progressValues()).not.toContain(-1);

    second.finish("completed");

    expect(progressValues().at(-1)).toBe(-1);
  });

  test("keeps a finished download's bytes until the last one ends, so it never runs backwards", () => {
    const first = arrive({ totalBytes: 100 });
    const second = arrive({ filename: "b.pdf", totalBytes: 100 });

    first.finish("completed");

    second.progress(50);

    expect(progressValues().at(-1)).toBe(150 / 200);
  });

  test("is indeterminate for a download of unknown size, never NaN or Infinity", () => {
    const item = arrive({ totalBytes: 0 });

    item.progress(0);
    item.progress(10);

    expect(progressValues().every((progress) => Number.isFinite(progress) && progress > 1)).toBe(
      true,
    );

    item.finish("completed");

    expect(progressValues().at(-1)).toBe(-1);
  });

  test("leaves out a download still waiting on its save dialog", () => {
    const running = arrive({ totalBytes: 100 });

    initDownloads({ "downloads.saveAs": true });

    arrive({ filename: "asked.pdf", totalBytes: 100 });

    running.progress(50);

    expect(progressValues().at(-1)).toBe(0.5);

    running.finish("completed");

    expect(progressValues().at(-1)).toBe(-1);
  });
});

describe("a download that fails", () => {
  const ERROR_BOX = ["Download Error", "The download of report.pdf was interrupted"];

  test("a dropped connection adds one row, shows the error once and clears the bar", async () => {
    const item = arrive({ totalBytes: 100 });

    item.progress(50);

    item.drop();
    item.emit("updated", {}, "interrupted");

    await settle();

    expect(historyNames()).toEqual(["report.pdf"]);
    expect(showErrorBox.mock.calls).toEqual([ERROR_BOX as [string, string]]);
    expect(progressValues().at(-1)).toBe(-1);
  });

  test("a dropped connection's partial file goes, from outside the notification", async () => {
    const item = arrive({ totalBytes: 100 });

    item.drop();

    expect(item.cancel).not.toHaveBeenCalled();

    await settle();

    expect(item.cancel).toHaveBeenCalledTimes(1);
    expect(item.state).toBe("cancelled");
  });

  test("the cancel that clears a dropped download records nothing more", async () => {
    const item = arrive({ totalBytes: 100 });

    item.drop();

    await settle();
    await settle();

    expect(item.cancel).toHaveBeenCalledTimes(1);
    expect(history()).toHaveLength(1);
    expect(showErrorBox).toHaveBeenCalledTimes(1);
    expect(createNotification).not.toHaveBeenCalled();
  });

  test("a dropped download leaves the next one's bar to clear on its own", async () => {
    arrive({ totalBytes: 100 }).drop();

    await settle();

    const next = arrive({ filename: "next.pdf", totalBytes: 100 });

    next.progress(50);

    expect(progressValues().at(-1)).toBe(0.5);

    next.finish("completed");

    expect(progressValues().at(-1)).toBe(-1);
  });

  test("a dropped download stops counting towards the others", async () => {
    const dropped = arrive({ totalBytes: 100 });
    const other = arrive({ filename: "other.pdf", totalBytes: 100 });

    dropped.progress(50);

    dropped.drop();

    await settle();

    other.progress(25);

    expect(progressValues().at(-1)).toBe(0.25);
  });

  test("one that ends as interrupted adds one row and shows the error once, with nothing to cancel", async () => {
    const item = arrive({ totalBytes: 100 });

    item.finish("interrupted");

    await settle();

    expect(historyNames()).toEqual(["report.pdf"]);
    expect(showErrorBox.mock.calls).toEqual([ERROR_BOX as [string, string]]);
    expect(item.cancel).not.toHaveBeenCalled();
    expect(progressValues().at(-1)).toBe(-1);
  });

  test("the error names the file as it was saved", async () => {
    writeFileSync(path.join(location, "report.pdf"), "");

    arrive().finish("interrupted");

    await settle();

    expect(showErrorBox.mock.calls[0]?.[1]).toBe("The download of report (1).pdf was interrupted");
  });

  test.each(["report\\x41.pdf", "report\\u0041.pdf", "a$&b.pdf", "$`$'$$.pdf"])(
    "the error names %s as it was saved",
    async (filename) => {
      arrive({ filename }).finish("interrupted");

      await settle();

      expect(showErrorBox.mock.calls[0]?.[1]).toBe(`The download of ${filename} was interrupted`);
    },
  );

  test("the error and its title are translated", async () => {
    i18n.load("de", {
      [generateMessageId("Download Error")]: "Downloadfehler",
      [generateMessageId("The download of {fileName} was interrupted")]: [
        "Abgebrochen: ",
        ["fileName"],
      ],
    });

    i18n.activate("de");

    try {
      arrive({ filename: "a$&b.pdf" }).finish("interrupted");

      await settle();

      expect(showErrorBox.mock.calls).toEqual([["Downloadfehler", "Abgebrochen: a$&b.pdf"]]);
    } finally {
      i18n.activate("en");
    }
  });

  test("the error falls back to the name Chromium offered with no save path", async () => {
    initDownloads({ "downloads.saveAs": true });

    arrive({ filename: "unsaved.pdf" }).finish("interrupted");

    await settle();

    expect(showErrorBox.mock.calls[0]?.[1]).toBe("The download of unsaved.pdf was interrupted");
  });
});

describe("when a download completes", () => {
  test("the Dock's Downloads stack hears of it", async () => {
    const item = arrive();

    item.finish("completed");

    await settle();

    expect(downloadFinished.mock.calls).toEqual([[item.savePath]]);
  });

  test("quarantine comes first on macOS, ahead of the history, the folder and the notification", async () => {
    currentPlatform.isMacOS = true;
    currentPlatform.isLinux = false;

    store["downloads.openFolderWhenDone"] = true;

    let finishQuarantine = () => {};

    quarantineFile.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishQuarantine = resolve;
        }),
    );

    const item = arrive();

    item.finish("completed");

    await settle();

    expect(quarantineFile.mock.calls).toEqual([[item.savePath]]);
    expect(history()).toEqual([]);
    expect(showItemInFolder).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();

    finishQuarantine();

    await settle();

    expect(historyNames()).toEqual(["report.pdf"]);
    expect(showItemInFolder.mock.calls).toEqual([[item.savePath]]);
    expect(createNotification).toHaveBeenCalledTimes(1);
  });

  test("only a completed download is quarantined", async () => {
    currentPlatform.isMacOS = true;
    currentPlatform.isLinux = false;

    arrive().finish("interrupted");

    await settle();

    expect(quarantineFile).not.toHaveBeenCalled();
  });

  test("the folder opens only with its setting on", async () => {
    arrive().finish("completed");

    await settle();

    expect(showItemInFolder).not.toHaveBeenCalled();
  });

  test("no notification goes out with its setting off", async () => {
    store["notifications.downloadCompleted"] = false;

    arrive().finish("completed");

    await settle();

    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe("the download notification", () => {
  test.each(["report\\x41.pdf", "report\\u0041.pdf", "a$&b.pdf", "$`$'$$.pdf"])(
    "names %s as it was saved",
    async (filename) => {
      arrive({ filename }).finish("completed");

      await settle();

      expect(createNotification.mock.calls[0]?.[0].title).toBe(`Downloaded ${filename}`);
    },
  );
});

describe("the download history", () => {
  test("records a completed download", async () => {
    const item = arrive();

    item.finish("completed");

    await settle();

    expect(history().map(({ fileName, filePath }) => ({ fileName, filePath }))).toEqual([
      { fileName: "report.pdf", filePath: item.savePath },
    ]);
  });

  test("records nothing when the save dialog is cancelled", async () => {
    initDownloads({ "downloads.saveAs": true });

    arrive().finish("cancelled");

    await settle();

    expect(history()).toEqual([]);
    expect(showErrorBox).not.toHaveBeenCalled();
  });

  test("records nothing when a download is cancelled under way", async () => {
    arrive().finish("cancelled");

    await settle();

    expect(history()).toEqual([]);
    expect(showErrorBox).not.toHaveBeenCalled();
  });
});

describe("Save Image As", () => {
  const NO_CLICK = {
    dictionarySuggestions: [] as string[],
    isEditable: false,
    linkText: "",
    linkURL: "",
    mediaType: "image",
    misspelledWord: "",
    selectionText: "",
    x: 0,
    y: 0,
  };

  let urlCount = 0;

  /** An address no other test has asked for, since pending saves outlive a test. */
  function imageUrl() {
    urlCount += 1;

    return `https://example.com/image-${urlCount}.png`;
  }

  /** Right-clicks an image in a view of `session` and chooses Save Image As. */
  function saveImage(srcURL: string) {
    let contextMenuListener: (event: unknown, parameters: unknown) => void = () => {};

    const downloadURL = mock((_url: string) => {});

    const view = {
      webContents: {
        downloadURL,
        focusedFrame: null,
        getURL: () => "https://example.com/page",
        on(_event: string, listener: typeof contextMenuListener) {
          contextMenuListener = listener;
        },
        once: () => {},
        session,
      },
    };

    setupWindowContextMenu(view as unknown as BrowserWindow);

    contextMenuListener({}, { ...NO_CLICK, pageURL: "https://example.com/page", srcURL });

    const item = template.find(({ id }) => id === "saveImageAs");

    if (!item) {
      throw new Error("The menu has no Save Image As");
    }

    (item.click as unknown as (menuItem: unknown) => void)(item);

    return { downloadURL, webContents: view.webContents };
  }

  function arriveImage(url: string, redirectedTo?: string) {
    return arrive({
      filename: "image.png",
      mimeType: "image/png",
      urlChain: redirectedTo ? [url, redirectedTo] : [url],
    });
  }

  function expectAsked(item: FakeItem, defaultName = "image.png", directory = location) {
    expect(item.savePath).toBe("");
    expect(item.dialogOptions).toEqual({ defaultPath: path.join(directory, defaultName) });
  }

  // Electron opens the dialog only for an item with no save path once every listener has returned.
  function expectSavedWithoutAsking(item: FakeItem, name = "image.png") {
    expect(item.savePath).toBe(path.join(location, name));
  }

  test("asks for the image's address from its view", () => {
    const url = imageUrl();

    expect(saveImage(url).downloadURL.mock.calls).toEqual([[url]]);
  });

  test("asks where to save with Save As off, starting in the configured folder", () => {
    const url = imageUrl();

    saveImage(url);

    expectAsked(arriveImage(url));
  });

  test("starts in the folder configured now, not the one read at startup", () => {
    const url = imageUrl();

    const changed = mkdtempSync(path.join(tmpdir(), "meru-downloads-test-"));

    store["downloads.location"] = changed;

    saveImage(url);

    expectAsked(arriveImage(url), "image.png", changed);

    rmSync(changed, { recursive: true, force: true });
  });

  test("asks for an image that redirects", () => {
    const url = imageUrl();

    saveImage(url);

    expectAsked(arriveImage(url, "https://example.com/moved.png"));
  });

  test("recognises an address Chromium reports in its canonical form", () => {
    saveImage("https://EXAMPLE.com/a image.png");

    expectAsked(arriveImage("https://example.com/a%20image.png"));
  });

  test("leaves another download arriving first to follow the setting", () => {
    const url = imageUrl();

    saveImage(url);

    expectSavedWithoutAsking(arriveImage("https://example.com/other.png"));
  });

  test("still asks when another download finishes before the image arrives", () => {
    const url = imageUrl();

    saveImage(url);

    arrive({ filename: "other.pdf" }).finish("completed");

    expectAsked(arriveImage(url));
  });

  test("asks once for each of two saves of one address, then no more", () => {
    const url = imageUrl();

    saveImage(url);
    saveImage(url);

    expectAsked(arriveImage(url));
    expectAsked(arriveImage(url), "image (1).png");

    expectSavedWithoutAsking(arriveImage(url), "image (2).png");
  });

  test("a later ordinary download of that address isn't asked", async () => {
    const url = imageUrl();

    saveImage(url);

    const saved = arriveImage(url);

    saved.setSavePath(path.join(location, "chosen.png"));

    saved.finish("completed");

    await settle();

    expectSavedWithoutAsking(arriveImage(url));
  });

  test("still asks for a download arriving just inside the minute", () => {
    jest.useFakeTimers();

    const url = imageUrl();

    saveImage(url);

    jest.advanceTimersByTime(ms("1m") - 1);

    expectAsked(arriveImage(url));
  });

  test("expires after a minute with no download arriving", () => {
    jest.useFakeTimers();

    const url = imageUrl();

    saveImage(url);

    jest.advanceTimersByTime(ms("1m") + 1);

    expectSavedWithoutAsking(arriveImage(url));
  });

  test("leaves the badge alone, whichever way the download goes", async () => {
    const url = imageUrl();

    saveImage(url);

    const item = arriveImage(url);

    item.setSavePath(path.join(location, "chosen.png"));

    item.progress(1);
    item.finish("completed");

    await settle();

    expect(badgeCounts).not.toHaveBeenCalled();
    expect(dockBadges).not.toHaveBeenCalled();
  });

  test("an ordinary download leaves the badge alone", async () => {
    const item = arrive();

    item.progress(1);
    item.finish("completed");

    await settle();

    expect(badgeCounts).not.toHaveBeenCalled();
    expect(dockBadges).not.toHaveBeenCalled();
  });

  test("with an empty address logs and does nothing", () => {
    const { downloadURL } = saveImage("");

    expect(downloadURL).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
