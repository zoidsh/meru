import { mkdir, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { ms } from "@meru/shared/ms";
import { expect, test } from "@playwright/test";
import { useApp } from "./lib/app";
import type { TestFile } from "./lib/server";

const DOWNLOADS_DIRECTORY = "configured-downloads";

const meru = useApp(async ({ userDataDir }) => {
  const downloadsLocation = path.join(userDataDir, DOWNLOADS_DIRECTORY);

  await mkdir(downloadsLocation);

  return {
    "downloads.location": downloadsLocation,
    "downloads.saveAs": false,
    "notifications.downloadCompleted": false,
  };
});

type MainProcessGlobals = typeof globalThis & {
  doneStates: string[];
  errorBoxes: { title: string; content: string }[];
  progress: number[];
  startedCount: number;
};

function downloadsLocation() {
  return path.join(meru.userDataDir, DOWNLOADS_DIRECTORY);
}

/**
 * Waits for the account view, stands in for the error box so none stays open,
 * and records what reaches the window's progress bar and how downloads end.
 */
async function watchDownloads() {
  const { signInUrl } = meru.gmailStandIn;

  await expect.poll(() => meru.app.windows().some((page) => page.url() === signInUrl)).toBe(true);

  await meru.app.evaluate(({ BrowserWindow, dialog, webContents }, viewUrl) => {
    const main = globalThis as MainProcessGlobals;

    main.doneStates = [];
    main.errorBoxes = [];
    main.progress = [];
    main.startedCount = 0;

    dialog.showErrorBox = (title, content) => {
      main.errorBoxes.push({ title, content });
    };

    const window = BrowserWindow.getAllWindows().find((candidate) =>
      candidate.webContents.getURL().includes("main.html"),
    );

    if (!window) {
      throw new Error("The main window is gone");
    }

    const setProgressBar = window.setProgressBar.bind(window);

    window.setProgressBar = (progress, options) => {
      main.progress.push(progress);

      setProgressBar(progress, options);
    };

    const view = webContents.getAllWebContents().find((page) => page.getURL() === viewUrl);

    if (!view) {
      throw new Error("The account view is gone");
    }

    view.session.on("will-download", (_event, item) => {
      main.startedCount += 1;

      item.once("done", (_doneEvent, state) => {
        main.doneStates.push(state);
      });
    });
  }, signInUrl);
}

function download(file: TestFile) {
  return meru.app.evaluate(
    ({ webContents }, { viewUrl, url }) => {
      webContents
        .getAllWebContents()
        .find((page) => page.getURL() === viewUrl)
        ?.downloadURL(url);
    },
    { viewUrl: meru.gmailStandIn.signInUrl, url: meru.gmailStandIn.fileUrl(file) },
  );
}

function readMain<Key extends "doneStates" | "errorBoxes" | "progress" | "startedCount">(key: Key) {
  return meru.app.evaluate(
    (_electron, name) => (globalThis as MainProcessGlobals)[name],
    key,
  ) as Promise<MainProcessGlobals[Key]>;
}

async function historyNames() {
  return (await meru.readConfig())["downloads.history"]?.map(({ fileName }) => fileName);
}

async function savedFiles() {
  return (await readdir(downloadsLocation())).sort();
}

function readSavedFile(name: string) {
  return readFile(path.join(downloadsLocation(), name), "utf8");
}

test("an ordinary download lands in the configured folder and the history, with its extension added", async () => {
  await watchDownloads();

  await download({ name: "notes", type: "text/plain", body: "Some notes" });

  await expect.poll(savedFiles).toEqual(["notes.txt"]);

  expect(await readSavedFile("notes.txt")).toBe("Some notes");

  await expect.poll(historyNames).toEqual(["notes.txt"]);

  const [row] = (await meru.readConfig())["downloads.history"] ?? [];

  expect(row?.filePath).toBe(path.join(downloadsLocation(), "notes.txt"));
});

test("an extensionless JPEG gets .jpg", async () => {
  await watchDownloads();

  await download({ name: "photo", type: "image/jpeg", body: "Not really a JPEG" });

  await expect.poll(savedFiles).toEqual(["photo.jpg"]);

  await expect.poll(historyNames).toEqual(["photo.jpg"]);
});

test("two same-named downloads at once both survive with their own content", async () => {
  await watchDownloads();

  await download({ name: "same.txt", type: "text/plain", body: "the first", delivery: "heldBody" });

  await download({
    name: "same.txt",
    type: "text/plain",
    body: "the second",
    delivery: "heldBody",
  });

  await expect.poll(() => readMain("startedCount")).toBe(2);

  meru.gmailStandIn.releaseHeld();

  await expect.poll(() => readMain("doneStates")).toEqual(["completed", "completed"]);

  await expect.poll(savedFiles, { timeout: ms("10s") }).toEqual(["same (1).txt", "same.txt"]);

  expect(
    (await Promise.all([readSavedFile("same.txt"), readSavedFile("same (1).txt")])).sort(),
  ).toEqual(["the first", "the second"]);

  await expect
    .poll(async () => (await historyNames())?.sort())
    .toEqual(["same (1).txt", "same.txt"]);
});

test("a dropped connection adds one row, shows the error once and clears the bar, and the next download clears it too", async () => {
  await watchDownloads();

  await download({ name: "dropped.bin", type: "application/octet-stream", delivery: "dropped" });

  await expect
    .poll(() => readMain("errorBoxes"))
    .toEqual([{ title: "Download Error", content: "The download of dropped.bin was interrupted" }]);

  await expect.poll(historyNames).toEqual(["dropped.bin"]);

  await expect.poll(async () => (await readMain("progress")).at(-1)).toBe(-1);

  // The cancel that takes the partial file with it.
  await expect.poll(() => readMain("doneStates")).toEqual(["cancelled"]);

  expect(await readMain("errorBoxes")).toHaveLength(1);

  expect(await historyNames()).toEqual(["dropped.bin"]);

  await expect.poll(savedFiles).toEqual([]);

  await download({ name: "next.txt", type: "text/plain", body: "After the drop" });

  await expect.poll(savedFiles).toEqual(["next.txt"]);

  await expect.poll(() => readMain("doneStates")).toEqual(["cancelled", "completed"]);

  await expect.poll(async () => (await readMain("progress")).at(-1)).toBe(-1);

  await expect.poll(historyNames).toEqual(["next.txt", "dropped.bin"]);

  expect(await readMain("errorBoxes")).toHaveLength(1);

  // The partial file is gone, which is what the history says of the row once it looks.
  expect(await meru.runMenuCommand("Downloads")).toBe(true);

  await expect(meru.renderer.getByTitle("dropped.bin")).toBeVisible();

  await expect(meru.renderer.getByText("File moved or deleted")).toHaveCount(1);
});

test("a download of unknown size shows an indeterminate bar, never NaN or Infinity", async () => {
  await watchDownloads();

  await download({
    name: "unknown.txt",
    type: "text/plain",
    body: "Of a length nobody announced",
    delivery: "heldBodyOfUnknownSize",
  });

  await expect.poll(async () => (await readMain("progress")).length).toBeGreaterThan(0);

  const whileRunning = await readMain("progress");

  meru.gmailStandIn.releaseHeld();

  await expect.poll(() => readMain("doneStates")).toEqual(["completed"]);

  await expect.poll(async () => (await readMain("progress")).at(-1)).toBe(-1);

  expect(whileRunning.every((progress) => progress > 1 && Number.isFinite(progress))).toBe(true);

  // Chromium knows the size by the last update before `done`, so that one can be an ordinary value.
  expect((await readMain("progress")).every((progress) => Number.isFinite(progress))).toBe(true);
});
