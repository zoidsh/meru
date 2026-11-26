import { realpathSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { ElectronApplication, Locator, Page } from "@playwright/test";
import { delay, escapeRegExp } from "es-toolkit";

import { OWN_WINDOW_CARD_FRAME_PREFIX } from "#core/own-window.ts";

import {
  clickMenuItem,
  expect,
  findOverlayDocument,
  findPage,
  isDrawn,
  readListHighlight,
  readMenuItem,
  readState,
  test,
  writeState,
} from "./lib/app.ts";
import {
  findTitlebar,
  findWindowDownloads,
  readOwnWindows,
} from "./lib/own-window.ts";
import {
  THEMES,
  emulateTheme,
  onlyWithShots,
  shootWindow,
  shotPath,
} from "./lib/shots.ts";
import type { DownloadFile, StandIn } from "./lib/stand-in.ts";
import {
  DOWNLOAD_FILES,
  DOWNLOAD_IN_TAB_LINK,
  DOWNLOAD_LINKS,
} from "./lib/stand-in.ts";

const DAY = 24 * 60 * 60 * 1000;

interface CapturedFiles {
  opened: string[];
  shown: string[];
  dragged: string[];
}

interface CapturedSignals {
  progress: (number | null | undefined)[];
  landed: string[];
}

/**
 * A path in one spelling for each file, as main and the test may name it
 * apart: past the link macOS puts before the temporary folder, and with
 * Windows' long names where one folder has a short 8.3 name too.
 */
const canonical = (file: string) => realpathSync.native(file);

/** Where the test build saves downloads, in place of the system's folder. */
const downloadsFolder = (userDataDir: string) =>
  path.join(canonical(userDataDir), "Downloads");

/** The files the test build opened in place of handing them to the system. */
const readOpened = async (app: ElectronApplication) => {
  const files = await app.evaluate(
    () => Reflect.get(globalThis, "meruTestDownloadFiles") as CapturedFiles
  );

  return files.opened.map(canonical);
};

/** The files the test build showed in their folder in place of the system. */
const readShown = async (app: ElectronApplication) => {
  const files = await app.evaluate(
    () => Reflect.get(globalThis, "meruTestDownloadFiles") as CapturedFiles
  );

  return files.shown.map(canonical);
};

/** The files the test build dragged in place of the system's drag. */
const readDragged = async (app: ElectronApplication) => {
  const files = await app.evaluate(
    () => Reflect.get(globalThis, "meruTestDownloadFiles") as CapturedFiles
  );

  return files.dragged.map(canonical);
};

/** Presses on the row and moves the pointer away with it held. */
const dragOut = async (overlay: Page, target: Locator) => {
  const box = await target.boundingBox();
  const x = (box?.x ?? 0) + 40;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  await overlay.mouse.move(x, y);
  await overlay.mouse.down();
  await overlay.mouse.move(x + 60, y + 60, { steps: 6 });
  await overlay.mouse.up();
};

interface CapturedNotification {
  title: string;
  body: string;
  actions?: string[];
  click: () => void;
  act: (index: number) => void;
}

/** What the suite's build captured in place of showing, in order. */
const readNotifications = (app: ElectronApplication) =>
  app.evaluate(() =>
    (
      Reflect.get(globalThis, "meruTestNotifications") as CapturedNotification[]
    ).map(({ title, body, actions }) => ({
      title,
      body,
      actions: actions ?? [],
    }))
  );

const clickNotification = (app: ElectronApplication, index: number) =>
  app.evaluate((_electron, at) => {
    (
      Reflect.get(globalThis, "meruTestNotifications") as CapturedNotification[]
    )[at]?.click();
  }, index);

const actOnNotification = (
  app: ElectronApplication,
  index: number,
  action: number
) =>
  app.evaluate(
    (_electron, [at, button]) => {
      (
        Reflect.get(
          globalThis,
          "meruTestNotifications"
        ) as CapturedNotification[]
      )[at]?.act(button);
    },
    [index, action] as const
  );

/** Each progress the Dock or taskbar was given, in order. */
const readProgress = (app: ElectronApplication) =>
  app.evaluate(
    () =>
      (Reflect.get(globalThis, "meruTestDownloadSignals") as CapturedSignals)
        .progress
  );

/** Each file the Dock was told landed. */
const readLanded = async (app: ElectronApplication) => {
  const signals = await app.evaluate(
    () => Reflect.get(globalThis, "meruTestDownloadSignals") as CapturedSignals
  );

  return signals.landed.map(canonical);
};

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
  seeded: Seeded[] = [],
  state: Record<string, unknown> = {}
) => {
  const folder = downloadsFolder(userDataDir);

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
    ...state,
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
    gmail,
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

test("cancels a running download from its row, which stays listed as canceled with no file left", async ({
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

  await expect(running).toContainText("Canceled · now");
  await expect(downloadsButton(shell)).toHaveAttribute(
    "data-downloads",
    "plain"
  );
  expect(
    await exists(path.join(folder, DOWNLOAD_FILES.stalled.name))
  ).toBeFalsy();
});

test("lists a download whose connection drops as failed, with no partial file left", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, download, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const failed = DOWNLOAD_FILES.broken.name;

  await download("broken");
  await expect(downloadsButton(shell)).toHaveAccessibleDescription(
    "50% downloaded"
  );
  standIn.releaseDownload("broken");
  await expect(downloadsButton(shell)).toHaveAttribute(
    "data-downloads",
    "plain"
  );
  await openCard(shell, overlay);

  await expect(row(overlay, failed)).toContainText("Failed · now");
  await expect.poll(() => readdir(folder)).toStrictEqual([]);
});

test("tells of a finished download, whose button shows the file in its folder, and of a failed one, which opens the card", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, download, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn
  );
  const finished = DOWNLOAD_FILES.small.name;
  const failed = DOWNLOAD_FILES.broken.name;
  const label =
    process.platform === "darwin" ? "Show in Finder" : "Show in folder";

  await download("small");
  await expect
    .poll(() => readNotifications(app))
    .toStrictEqual([
      { title: `Downloaded ${finished}`, body: "", actions: [label] },
    ]);
  await actOnNotification(app, 0, 0);
  await expect
    .poll(() => readShown(app))
    .toStrictEqual([path.join(folder, finished)]);

  await download("broken");
  standIn.releaseDownload("broken");
  await expect
    .poll(async () => {
      const notifications = await readNotifications(app);

      return notifications.at(1);
    })
    .toStrictEqual({ title: "Download failed", body: failed, actions: [] });
  await clickNotification(app, 1);
  await expect(row(overlay, failed)).toContainText("Failed · now");
});

test("closes a tab a link opened only to download, the file saved and Gmail selected again", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { gmail, folder } = await launch(launchApp, userDataDir, standIn);
  const tabs = async () => {
    const { profiles } = await readState<{
      profiles: { tabs: { app: string }[]; selectedTabId: string }[];
    }>(userDataDir);

    return profiles.map(({ tabs: kept, selectedTabId }) => [
      kept.map((tab) => tab.app),
      selectedTabId,
    ]);
  };

  await gmail.getByRole("link", { name: DOWNLOAD_IN_TAB_LINK }).click();
  await expect.poll(() => listedCount(userDataDir)).toBe(1);

  // Only a Drive tab could have asked Drive for it, and it went once it did.
  await expect.poll(tabs).toStrictEqual([[["gmail"], "gmail"]]);
  await expect
    .poll(() => exists(path.join(folder, DOWNLOAD_FILES.small.name)))
    .toBe(true);
});

test("holds a download's notification under Do Not Disturb", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, download, overlay } = await launch(
    launchApp,
    userDataDir,
    standIn,
    [],
    { doNotDisturb: { until: null } }
  );

  await download("small");
  await openCard(shell, overlay);
  await expect(row(overlay, DOWNLOAD_FILES.small.name)).toContainText("now");
  expect(await readNotifications(app)).toStrictEqual([]);
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

test("drags a finished row out as its file, and reads one no longer there as moved or deleted", async ({
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
      { fileName: "failed.pdf", state: "failed" },
    ]
  );

  await openCard(shell, overlay);
  await expect(row(overlay, "moved.pdf")).toContainText("1 kB · ");
  await rm(path.join(folder, "moved.pdf"), { force: true });

  await dragOut(overlay, row(overlay, "kept.pdf"));
  await expect
    .poll(() => readDragged(app))
    .toStrictEqual([path.join(folder, "kept.pdf")]);

  await dragOut(overlay, row(overlay, "moved.pdf"));
  await expect(row(overlay, "moved.pdf")).toContainText("Moved or deleted");

  await dragOut(overlay, row(overlay, "failed.pdf"));
  // A failed row has no file to drag, and the card stays open.
  await expect(card(overlay)).toBeVisible();
  expect(await readDragged(app)).toStrictEqual([path.join(folder, "kept.pdf")]);
  // A drag is no click: nothing opened.
  expect(await readOpened(app)).toStrictEqual([]);
});

/** Whether the own window has a Downloads card document over its page. */
const windowCardOpen = async (app: ElectronApplication) => {
  const [window] = await readOwnWindows(app);

  return (
    window?.views.some((view) =>
      view.name.startsWith(OWN_WINDOW_CARD_FRAME_PREFIX)
    ) ?? false
  );
};

test("opens the card in a tab's own window from its titlebar, the one card moving between windows, closing on Escape or a press beside it, and counting a finish as seen", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { app, shell, download, overlay, folder } = await launch(
    launchApp,
    userDataDir,
    standIn,
    [{ fileName: "kept.pdf", state: "completed" }],
    {
      profiles: [
        {
          id: "p0",
          name: "Home",
          tabs: [
            { id: "gmail", app: "gmail", url: standIn.url, title: "" },
            {
              id: "c",
              app: "calendar",
              url: standIn.calendarUrl,
              title: "",
              ownWindow: true,
            },
          ],
          selectedTabId: "gmail",
        },
      ],
    }
  );
  const titlebar = await findTitlebar(app);
  const inWindow = downloadsButton(titlebar);
  const inMain = downloadsButton(shell);

  await download("small");
  await expect(inWindow).toHaveAttribute("data-downloads", "finished");
  await expect(inMain).toHaveAttribute("data-downloads", "finished");

  await inWindow.click();

  let document = await findWindowDownloads(app);

  await expect(row(document, "kept.pdf")).toContainText("1 kB · ");
  await expect(row(document, DOWNLOAD_FILES.small.name)).toBeFocused();
  await expect(inWindow).toHaveAttribute("aria-pressed", "true");
  await expect(inMain).toHaveAttribute("aria-pressed", "false");
  // Seen in any window: neither button is green any more.
  await expect(inWindow).toHaveAttribute("data-downloads", "plain");
  await expect(inMain).toHaveAttribute("data-downloads", "plain");
  // The main window's overlay shows nothing.
  await expect(card(overlay)).toBeHidden();

  await dragOut(document, row(document, "kept.pdf"));
  await expect
    .poll(() => readDragged(app))
    .toStrictEqual([path.join(folder, "kept.pdf")]);

  // Its keydown closes the document, which a keyup would then not reach.
  await document.keyboard.down("Escape");
  await expect.poll(() => windowCardOpen(app)).toBe(false);
  await expect(inWindow).toHaveAttribute("aria-pressed", "false");

  // Its button again closes it, and opening in the main window moves it there.
  await inWindow.click();
  document = await findWindowDownloads(app);
  await expect(card(document)).toBeVisible();
  await inWindow.click();
  await expect.poll(() => windowCardOpen(app)).toBe(false);

  await inWindow.click();
  await findWindowDownloads(app);
  await openCard(shell, overlay);
  await expect.poll(() => windowCardOpen(app)).toBe(false);
  await expect(inMain).toHaveAttribute("aria-pressed", "true");
  await expect(inWindow).toHaveAttribute("aria-pressed", "false");

  await inWindow.click();
  document = await findWindowDownloads(app);
  await expect(card(overlay)).toBeHidden();
  await document.mouse.move(8, 8);
  await document.mouse.down();
  await expect.poll(() => windowCardOpen(app)).toBe(false);

  // A press on the titlebar closes it too; released away from Reload, it
  // reloads nothing.
  await inWindow.click();
  await findWindowDownloads(app);
  await titlebar.getByRole("button", { name: "Reload" }).hover();
  await titlebar.mouse.down();
  await expect.poll(() => windowCardOpen(app)).toBe(false);
  await titlebar.mouse.move(0, 0);
  await titlebar.mouse.up();
});

test("moves the one selected row to the pointer as it moves over a row, keeping it as the pointer leaves and as the keys go on from there", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, overlay } = await launch(launchApp, userDataDir, standIn, [
    { fileName: "a.pdf", state: "completed" },
    { fileName: "b.pdf", state: "completed" },
    { fileName: "c.pdf", state: "failed" },
    { fileName: "d.pdf", state: "completed" },
  ]);
  const list = grid(overlay);

  await openCard(shell, overlay);
  await expectFileNames(overlay, ["a.pdf", "b.pdf", "c.pdf", "d.pdf"]);
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [0],
    filled: [0],
  });

  // The pointer arrives in the card; the first move a page hears tells no
  // movement, as Chromium's own made-up moves do not.
  await overlay.mouse.move(4, 4);
  // One that does nothing when chosen is selected all the same.
  await row(overlay, "c.pdf").hover();
  await expect(row(overlay, "c.pdf")).toBeFocused();
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [2],
    filled: [2],
  });
  await expect
    .poll(() =>
      isDrawn(
        row(overlay, "c.pdf").getByRole("button", {
          name: "Remove from the list",
        })
      )
    )
    .toBe(true);
  await expect
    .poll(() =>
      isDrawn(
        row(overlay, "a.pdf").getByRole("button", {
          name: "Remove from the list",
        })
      )
    )
    .toBe(false);

  await overlay.mouse.move(4, 4);
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [2],
    filled: [2],
  });

  await row(overlay, "b.pdf").hover();
  await overlay.keyboard.press("ArrowDown");
  await expect(row(overlay, "c.pdf")).toBeFocused();
  // The pointer, still over b.pdf, takes nothing back.
  await delay(200);
  expect(await readListHighlight(list)).toStrictEqual({
    selected: [2],
    filled: [2],
  });
});

test("moves through the list with the keys, opens with Enter, cancels a running download or removes another with Delete, and clears all but those running", async ({
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
  const cancelled = "backup (1).zip";

  await download("stalled");
  await download("stalled");
  await openCard(shell, overlay);
  await expect(row(overlay, cancelled)).toBeFocused();
  await expectFileNames(overlay, [
    cancelled,
    running,
    "a.pdf",
    "b.pdf",
    "c.pdf",
    "d.pdf",
  ]);

  await overlay.keyboard.press("ArrowDown");
  await expect(row(overlay, running)).toBeFocused();
  await overlay.keyboard.press("End");
  await expect(row(overlay, "d.pdf")).toBeFocused();
  await overlay.keyboard.press("Home");
  await expect(row(overlay, cancelled)).toBeFocused();

  // A running download is cancelled, and stays listed.
  await overlay.keyboard.press("Delete");
  await expect(row(overlay, cancelled)).toContainText("Canceled · now");
  await expect(row(overlay, running)).toContainText("Starting…");

  await overlay.keyboard.press("ArrowDown");
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

test("lists one running at the last quit as canceled, and drops what started over 30 days ago", async ({
  launchApp,
  userDataDir,
  standIn,
}) => {
  const { shell, overlay } = await launch(launchApp, userDataDir, standIn, [
    { fileName: "quit.zip", state: "progressing" },
    { fileName: "old.pdf", state: "failed", startedAt: Date.now() - 31 * DAY },
  ]);

  await openCard(shell, overlay);
  await expect(row(overlay, "quit.zip")).toContainText("Canceled · ");
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
  // The first row selected, as on opening: a running one keeps its spinner.
  await restPointer(overlay);

  for (const theme of THEMES) {
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await emulateTheme(app, theme);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await restPointer(overlay);
    // The first row selected again, after the rows the last scheme pointed at.
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await overlay.keyboard.press("Home");
    // The buttons of the row it leaves fade out.
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await delay(300);
    // oxlint-disable-next-line no-await-in-loop -- one scheme at a time
    await shootWindow(app, shell, shotPath("downloads", theme));

    for (const [name, fileName] of [
      ["running", "archive (1).zip"],
      ["finished", "Quarterly report.pdf"],
    ] as const) {
      // Another row selected, by the pointer passing over it.
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await row(overlay, "Old notes.txt").hover();
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await restPointer(overlay);
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await row(overlay, fileName).screenshot({
        path: shotPath(`downloads-row-${name}-rest`, theme),
      });
      // Selected by the pointer over it, so a running one shows Cancel.
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await row(overlay, fileName).hover();
      // Its buttons fade in.
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await delay(300);
      // oxlint-disable-next-line no-await-in-loop -- one row at a time
      await row(overlay, fileName).screenshot({
        path: shotPath(`downloads-row-${name}-selected`, theme),
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
