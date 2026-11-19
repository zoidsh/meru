import { mkdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Page } from "@playwright/test";
import { delay, escapeRegExp } from "es-toolkit";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  readMenuItem,
  readState,
  test,
  writeState,
} from "./lib/app.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import type { DownloadFile, StandIn } from "./lib/stand-in.ts";
import { DOWNLOAD_FILES, DOWNLOAD_LINKS } from "./lib/stand-in.ts";

const DAY = 24 * 60 * 60 * 1000;

interface CapturedFiles {
  opened: string[];
  shown: string[];
}

interface CapturedSignals {
  progress: (number | null | undefined)[];
  landed: string[];
}

/**
 * Where the test build saves downloads, in place of the system's folder, as
 * main names it: past the link macOS puts before the temporary folder.
 */
const downloadsFolder = async (userDataDir: string) =>
  path.join(await realpath(userDataDir), "Downloads");

/** The files the test build opened in place of handing them to the system. */
const readOpened = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestDownloadFiles") as CapturedFiles).opened
  );

/** Each progress the Dock or taskbar was given, in order. */
const readProgress = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestDownloadSignals") as CapturedSignals)
        .progress
  );

/** Each file the Dock was told landed. */
const readLanded = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestDownloadSignals") as CapturedSignals)
        .landed
  );

const sizeOf = async (file: string) => {
  const { size } = await stat(file);

  return size;
};

const menuChecked = async (app: ElectronApplication, id: string) => {
  const { checked } = await readMenuItem(app, id);

  return checked;
};

/** How many downloads `state.json` lists. */
const listedCount = async (userDataDir: string) => {
  const { downloads } = await readState<{ downloads?: unknown[] }>(userDataDir);

  return downloads?.length ?? 0;
};

const exists = async (file: string) => {
  try {
    await stat(file);

    return true;
  } catch {
    return false;
  }
};

const downloadsButton = (shell: Page) =>
  shell.getByRole("button", { name: "Downloads", exact: true });

const card = (overlay: Page) =>
  overlay.getByRole("dialog", { name: "Downloads" });

const grid = (overlay: Page) =>
  card(overlay).getByRole("grid", { name: "Downloaded files" });

const row = (overlay: Page, fileName: string) =>
  grid(overlay).getByRole("row").filter({ hasText: fileName });

/** Each row, top to bottom, starts with these file names. */
const expectFileNames = async (overlay: Page, names: string[]) => {
  await expect(grid(overlay).getByRole("row")).toHaveText(
    names.map((name) => new RegExp(`^${escapeRegExp(name)}`, "u"))
  );
};

interface Seeded {
  fileName: string;
  state: "progressing" | "completed" | "cancelled" | "failed";
  /** Left out of the folder, so it reads as moved or deleted. */
  gone?: boolean;
  size?: number;
  startedAt?: number;
}

/**
 * One profile, with the downloads given listed newest first and each finished
 * one's file in the test build's folder, unless it is to read as gone.
 */
const launch = async (
  launchApp: () => Promise<ElectronApplication>,
  userDataDir: string,
  standIn: StandIn,
  seeded: Seeded[] = []
) => {
  const folder = await downloadsFolder(userDataDir);

  await mkdir(folder, { recursive: true });
  await Promise.all(
    seeded
      .filter((entry) => entry.state === "completed" && !entry.gone)
      .map((entry) =>
        writeFile(
          path.join(folder, entry.fileName),
          Buffer.alloc(entry.size ?? 1000, 1)
        )
      )
  );
  await writeState(userDataDir, {
    profiles: [{ id: "p0", name: "Home" }],
    selectedProfileId: "p0",
    downloads: seeded.map((entry, index) => ({
      id: `seeded-${index}`,
      fileName: entry.fileName,
      path: path.join(folder, entry.fileName),
      size: entry.size ?? 1000,
      startedAt: entry.startedAt ?? Date.now() - (index + 1) * 60_000,
      state: entry.state,
    })),
  });

  const app = await launchApp();
  const shell = await findPage(app, "meru-app:");
  const gmail = await findPage(app, standIn.url);

  await gmail.goto(standIn.downloadsUrl);

  /**
   * Clicks the file's link and waits until main has taken the download,
   * which Chromium decides on later than the click on Linux.
   */
  const download = async (file: DownloadFile) => {
    const before = await listedCount(userDataDir);

    await gmail.getByRole("link", { name: DOWNLOAD_LINKS[file] }).click();
    await expect.poll(() => listedCount(userDataDir)).toBe(before + 1);
  };

  return {
    app,
    shell,
    download,
    overlay: await findOverlayDocument(app),
    folder,
  };
};

const openCard = async (shell: Page, overlay: Page) => {
  await downloadsButton(shell).click();
  await expect(card(overlay)).toBeVisible();
};

test("shows a download's progress on the titlebar button, the Dock and the card, and keeps the button green until the card opens", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, download, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const button = downloadsButton(shell);
  const saved = path.join(folder, DOWNLOAD_FILES.slow.name);

  await expect(button).toHaveAttribute("data-downloads", "plain");
  await download("slow");

  await expect(button).toHaveAttribute("data-downloads", "running");
  await expect(button).toHaveAccessibleDescription("50% downloaded");
  await expect.poll(() => readProgress(app)).toContain(0.5);

  await openCard(shell, overlay);
  await expect(row(overlay, DOWNLOAD_FILES.slow.name)).toContainText(
    "20 of 40 kB"
  );
  await overlay.keyboard.press("Escape");
  await expect(card(overlay)).toBeHidden();

  standIn.releaseDownload("slow");

  await expect(button).toHaveAttribute("data-downloads", "finished");
  await expect(button).toHaveAccessibleDescription("A download finished");
  expect(await sizeOf(saved)).toBe(DOWNLOAD_FILES.slow.size);

  const progress = await readProgress(app);

  // Nothing running clears the Dock's bar.
  expect(progress.at(-1)).toBeUndefined();
  expect(await readLanded(app)).toStrictEqual([saved]);

  await openCard(shell, overlay);
  await expect(row(overlay, DOWNLOAD_FILES.slow.name)).toContainText(
    /40 kB · now/u
  );
  await expect(button).toHaveAttribute("data-downloads", "plain");
  await overlay.keyboard.press("Escape");
  await expect(button).toHaveAttribute("data-downloads", "plain");
});

test("pulses the button while a size is not known, and names a second file of the same name apart", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, download, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn
  );

  await download("unsized");
  await expect(downloadsButton(shell)).toHaveAccessibleDescription(
    "Downloading"
  );
  await expect.poll(() => readProgress(app)).toContain(null);

  await download("small");
  await download("small");
  await openCard(shell, overlay);
  await expect(row(overlay, "report (1).pdf")).toContainText("2 kB");
  expect(await exists(path.join(folder, "report.pdf"))).toBeTruthy();
  expect(await exists(path.join(folder, "report (1).pdf"))).toBeTruthy();
  await expect(row(overlay, DOWNLOAD_FILES.unsized.name)).toContainText(
    "15 kB"
  );

  standIn.releaseDownload("unsized");

  await expect(row(overlay, DOWNLOAD_FILES.unsized.name)).toContainText(
    "30 kB · now"
  );
});

test("cancels a running download from its row, which stays listed as cancelled with no file left", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, download, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn
  );

  await download("stalled");
  await openCard(shell, overlay);

  const running = row(overlay, DOWNLOAD_FILES.stalled.name);

  await expect(running).toContainText("Starting…");
  // Clear all has nothing to take while only a running download is listed.
  await expect(
    card(overlay).getByRole("button", { name: "Clear all" })
  ).toBeDisabled();

  await running.hover();
  await running.getByRole("button", { name: "Cancel download" }).click();

  await expect(running).toContainText("Cancelled · now");
  await expect(downloadsButton(shell)).toHaveAttribute(
    "data-downloads",
    "plain"
  );
  expect(
    await exists(path.join(folder, DOWNLOAD_FILES.stalled.name))
  ).toBeFalsy();
});

test("reads a finished file no longer in its folder as moved or deleted, and opens one that is", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn,
    [
      { fileName: "kept.pdf", state: "completed" },
      { fileName: "moved.pdf", state: "completed" },
    ]
  );

  await rm(path.join(folder, "moved.pdf"), { force: true });
  await openCard(shell, overlay);
  await expect(row(overlay, "moved.pdf")).toContainText("Moved or deleted");
  await expect(row(overlay, "kept.pdf")).toContainText("1 kB · ");

  await row(overlay, "kept.pdf").click();

  await expect(card(overlay)).toBeHidden();
  expect(await readOpened(app)).toStrictEqual([path.join(folder, "kept.pdf")]);
});

test("moves through the list with the keys, opens with Enter, removes with Delete, and clears all but those running", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, download, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn,
    [
      { fileName: "a.pdf", state: "completed" },
      { fileName: "b.pdf", state: "completed" },
      { fileName: "c.pdf", state: "completed" },
      { fileName: "d.pdf", state: "failed" },
    ]
  );
  const running = DOWNLOAD_FILES.stalled.name;

  await download("stalled");
  await openCard(shell, overlay);
  await expect(row(overlay, running)).toBeFocused();
  await expectFileNames(overlay, [running, "a.pdf", "b.pdf", "c.pdf", "d.pdf"]);

  await overlay.keyboard.press("ArrowDown");
  await expect(row(overlay, "a.pdf")).toBeFocused();
  await overlay.keyboard.press("End");
  await expect(row(overlay, "d.pdf")).toBeFocused();
  await overlay.keyboard.press("Home");
  await expect(row(overlay, running)).toBeFocused();

  // A running download is not taken off the list, nor cancelled.
  await overlay.keyboard.press("Delete");
  await expect(row(overlay, running)).toContainText("Starting…");

  await overlay.keyboard.press("ArrowDown");
  await overlay.keyboard.press("ArrowDown");
  await expect(row(overlay, "b.pdf")).toBeFocused();
  await overlay.keyboard.press("Backspace");
  await expect(row(overlay, "b.pdf")).toHaveCount(0);
  await expect(row(overlay, "c.pdf")).toBeFocused();
  expect(await exists(path.join(folder, "b.pdf"))).toBeTruthy();

  await overlay.keyboard.press("Enter");
  await expect(card(overlay)).toBeHidden();
  expect(await readOpened(app)).toStrictEqual([path.join(folder, "c.pdf")]);

  await openCard(shell, overlay);
  await card(overlay).getByRole("button", { name: "Clear all" }).click();
  await expectFileNames(overlay, [running]);
  await expect(
    card(overlay).getByRole("button", { name: "Clear all" })
  ).toBeDisabled();
});

test("lists one running at the last quit as cancelled, and drops what started over 30 days ago", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, overlay } = await launch(launchApp, userDataDir, standIn, [
    { fileName: "quit.zip", state: "progressing" },
    { fileName: "old.pdf", state: "failed", startedAt: Date.now() - 31 * DAY },
  ]);

  await openCard(shell, overlay);
  await expect(row(overlay, "quit.zip")).toContainText("Cancelled · ");
  await expectFileNames(overlay, ["quit.zip"]);
});

test("opens and closes from View > Downloads, checked while open", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, overlay } = await launch(launchApp, userDataDir, standIn);

  await clickMenuItem(app, "downloads.toggle");
  await expect(card(overlay)).toBeVisible();
  await expect(card(overlay).getByText("No downloads yet")).toBeVisible();
  await expect.poll(() => menuChecked(app, "downloads.toggle")).toBeTruthy();
  await expect(
    card(overlay).getByRole("button", { name: "Clear all" })
  ).toHaveCount(0);

  await clickMenuItem(app, "downloads.toggle");
  await expect(card(overlay)).toBeHidden();
});

/** Away from every row, so none shows its buttons. */
const restPointer = async (overlay: Page) => {
  await overlay.mouse.move(4, 4);
  // The hover's end is painted a frame or two later, after the window shot would be taken.
  await delay(200);
};

const shootButton = async (
  shell: Page,
  app: ElectronApplication,
  name: string
) => {
  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    const box = await downloadsButton(shell).boundingBox();

    if (!box) {
      throw new Error("The Downloads button is not drawn");
    }

    // The titlebar's right-hand end, so the button shows beside its neighbours.
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shell.screenshot({
      path: shotPath(`downloads-button-${name}`, theme),
      clip: { x: box.x - 72, y: 0, width: box.width + 112, height: 40 },
    });
  }
};

test("draws the titlebar button and the card in every state, light and dark", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  onlyWithShots();

  const now = Date.now();
  const { app, shell, download, overlay } = await launch(
    launchApp,
    userDataDir,
    standIn,
    [
      {
        fileName: "Quarterly report.pdf",
        state: "completed",
        size: 2_400_000,
        startedAt: now - 2 * 60 * 60 * 1000,
      },
      {
        fileName: "Presentation.key",
        state: "failed",
        size: 48_000_000,
        startedAt: now - 3 * 60 * 60 * 1000,
      },
      {
        fileName: "Photos.zip",
        state: "cancelled",
        size: 120_000_000,
        startedAt: now - DAY - 60 * 60 * 1000,
      },
      {
        fileName: "Old notes.txt",
        state: "completed",
        gone: true,
        startedAt: now - 3 * DAY,
      },
    ]
  );
  const button = downloadsButton(shell);

  await shootButton(shell, app, "plain");

  await download("slow");
  await expect(button).toHaveAccessibleDescription("50% downloaded");
  await shootButton(shell, app, "half");

  await download("unsized");
  await expect(button).toHaveAccessibleDescription("Downloading");
  await shootButton(shell, app, "pulsing");

  standIn.releaseDownload("slow");
  standIn.releaseDownload("unsized");
  await expect(button).toHaveAttribute("data-downloads", "finished");
  await shootButton(shell, app, "green");

  await download("stalled");
  await download("slow");
  await openCard(shell, overlay);
  await expect(row(overlay, "archive (1).zip")).toContainText("20 of 40 kB");
  await expect(row(overlay, "Old notes.txt")).toContainText("Moved or deleted");
  // The selection on the last row, so the rows shot show none.
  await overlay.keyboard.press("End");
  await expect(row(overlay, "Old notes.txt")).toBeFocused();
  await restPointer(overlay);

  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await restPointer(overlay);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootWindow(app, shell, shotPath("downloads", theme));

    for (const [name, fileName] of [
      ["running", "archive (1).zip"],
      ["finished", "Quarterly report.pdf"],
    ] as const) {
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await restPointer(overlay);
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await row(overlay, fileName).screenshot({
        path: shotPath(`downloads-row-${name}-rest`, theme),
      });
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await row(overlay, fileName).hover();
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await row(overlay, fileName).screenshot({
        path: shotPath(`downloads-row-${name}-hover`, theme),
      });
    }
  }
});

test("draws the empty card, light and dark", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  onlyWithShots();

  const { app, shell, overlay } = await launch(launchApp, userDataDir, standIn);

  await openCard(shell, overlay);
  await expect(card(overlay).getByText("No downloads yet")).toBeVisible();

  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootWindow(app, shell, shotPath("downloads-empty", theme));
  }
});
