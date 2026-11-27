import { setImmediate as nextTurn } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { DOWNLOAD_LIFETIME, downloads as historyOf } from "#core/downloads.ts";
import type { DownloadEntry } from "#core/downloads.ts";
import { silentLog } from "#core/log.fake.ts";
import type { Platform } from "#core/platform.ts";
import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type {
  DownloadEnd,
  DownloadFiles,
  DownloadItem,
  DownloadSignals,
} from "#platform/downloads.ts";

import { createDownloads } from "./downloads.ts";

const NOW = 50 * DOWNLOAD_LIFETIME;
const FOLDER = "/Downloads";

const initial = (entries?: DownloadEntry[]): State => ({
  version: 1,
  profiles: [newProfile("a", "Default")],
  selectedProfileId: "a",
  ...(entries && { downloads: entries }),
});

const entry = (
  id: string,
  change: Partial<DownloadEntry> = {}
): DownloadEntry => ({
  id,
  fileName: `${id}.pdf`,
  path: `${FOLDER}/${id}.pdf`,
  size: 1000,
  startedAt: NOW - 1000,
  state: "completed",
  ...change,
});

interface FakeItem extends DownloadItem {
  savedTo: string | undefined;
  /** Where the save dialog opened, if it was asked. */
  askedAt: string | undefined;
  /** Answers the save dialog: a file, or nothing as Cancel does. */
  answer: (file: string | undefined) => void;
  cancelled: boolean;
  /** Bytes in so far, read on the next beat. */
  arrive: (bytes: number) => void;
  end: (how: DownloadEnd) => void;
}

/** A download its session hands over, driven by the test. */
const fakeItem = ({
  fileName = "report.pdf",
  mimeType = "application/pdf",
  total = 1000,
}: { fileName?: string; mimeType?: string; total?: number } = {}) => {
  const done = new Set<(end: DownloadEnd) => void>();
  let received = 0;
  let answered: ((file: string | undefined) => void) | undefined;
  const item: FakeItem = {
    fileName,
    mimeType,
    startedAt: NOW,
    savedTo: undefined,
    askedAt: undefined,
    cancelled: false,
    askWhere: (defaultPath) => {
      item.askedAt = defaultPath;

      const { promise, resolve } = Promise.withResolvers<string | undefined>();

      answered = resolve;

      return promise;
    },
    answer: (file) => {
      if (file === undefined) {
        item.cancel();
      } else {
        item.savedTo = file;
      }

      answered?.(file);
    },
    received: () => received,
    total: () => total,
    saveTo: (file) => {
      item.savedTo = file;
    },
    cancel: () => {
      item.cancelled = true;
      item.end("cancelled");
    },
    onDone: (listener) => {
      done.add(listener);
    },
    arrive: (bytes) => {
      received = bytes;
    },
    end: (how) => {
      for (const listener of done) {
        listener(how);
      }
    },
  };

  return item;
};

// The fakes answer at once, so one turn of the event loop ends them all.
const settle = () => nextTurn();

const setup = ({
  entries,
  platform = "darwin",
  onDisk = [],
  focused = false,
  folders = [],
}: {
  entries?: DownloadEntry[];
  platform?: Platform;
  onDisk?: string[];
  focused?: boolean;
  /** The folders there to be chosen, each writable. */
  folders?: string[];
} = {}) => {
  let state = initial(entries);
  let open = false;
  let ids = 0;
  let saving: Promise<unknown> = Promise.resolve();
  const disk = new Set(onDisk);
  const repeating = new Set<() => void>();
  const calls: string[] = [];
  const progress: (number | null | undefined)[] = [];
  let chosenFolder: string | null = null;
  const profileFolders = new Map<string, string | null>();
  let saveAs = false;
  let showWhenDone = false;
  const files: DownloadFiles = {
    folder: () => FOLDER,
    systemFolder: () => FOLDER,
    usable: (folder) => folders.includes(folder),
    // As the volumes macOS and Windows format by default, which ignore case.
    taken: (file) =>
      platform === "linux"
        ? disk.has(file)
        : [...disk].some((each) => each.toLowerCase() === file.toLowerCase()),
    exists: (file) => Promise.resolve(disk.has(file)),
    remove: (file) => {
      calls.push(`remove ${file}`);
      disk.delete(file);

      return Promise.resolve();
    },
    quarantine: (file) => {
      calls.push(`quarantine ${file}`);

      return Promise.resolve();
    },
    open: (file) => {
      calls.push(`open ${file}`);
    },
    showInFolder: (file) => {
      calls.push(`show ${file}`);
    },
    drag: (file, from) => {
      calls.push(`drag ${file} from ${from}`);
    },
  };
  const signals: DownloadSignals = {
    progress: (share) => {
      progress.push(share);
    },
    landed: (file) => {
      calls.push(`landed ${file}`);
    },
    focused: () => focused,
  };
  const downloads = createDownloads({
    platform,
    state: () => state,
    commit: (change) => {
      const previous = saving;

      saving = (async () => {
        await previous;
        state = change(state) ?? state;
      })();

      return saving;
    },
    files,
    signals,
    choices: {
      folder: (profileId) =>
        profileId !== undefined && profileFolders.has(profileId)
          ? (profileFolders.get(profileId) ?? null)
          : chosenFolder,
      saveAs: () => saveAs,
      showWhenDone: () => showWhenDone,
    },
    onFolderMissing: (folder) => {
      calls.push(`missing ${folder}`);
    },
    overlay: {
      isOpen: () => open,
      open: () => {
        open = true;
        calls.push("overlay open");
      },
      close: () => {
        open = false;
        calls.push("overlay close");
      },
      webContentsId: () => (open ? 7 : undefined),
    },
    // Every tab but "closed" has its own window open, its card document 9.
    windows: {
      isOpen: (key) => key.tabId !== "closed",
      webContentsId: () => 9,
    },
    newId: () => {
      ids += 1;

      return `d${ids}`;
    },
    now: () => NOW,
    repeat: (run) => {
      repeating.add(run);

      return () => {
        repeating.delete(run);
      };
    },
    // What it logs is kept apart from the calls it makes.
    log: silentLog,
  });

  /** Lets every save and file check that is under way finish. */

  return {
    downloads,
    /**
     * The folder Settings holds, `null` for the system's: the app's, or the
     * profile's own.
     */
    choose: (folder: string | null, profileId?: string) => {
      if (profileId === undefined) {
        chosenFolder = folder;
      } else {
        profileFolders.set(profileId, folder);
      }
    },
    askEachTime: () => {
      saveAs = true;
    },
    showEachWhenDone: () => {
      showWhenDone = true;
    },
    calls,
    progress,
    disk,
    history: () => historyOf(state),
    /** One beat of what repeats while anything runs. */
    beat: () => {
      for (const run of repeating) {
        run();
      }
    },
    repeating,
    land: (file: string) => {
      disk.add(file);
    },
  };
};

describe("taking a download", () => {
  it("saves it in the folder under its own name and lists it running", async () => {
    const { downloads, history } = setup();
    const item = fakeItem();

    downloads.take(item, "a");
    await settle();

    expect(item.savedTo).toBe("/Downloads/report.pdf");
    expect(history()).toStrictEqual([
      {
        id: "d1",
        fileName: "report.pdf",
        path: "/Downloads/report.pdf",
        size: 1000,
        startedAt: NOW,
        state: "progressing",
      },
    ]);
  });

  it("saves it in the folder chosen in Settings, under a name nothing there has", () => {
    const { downloads, choose } = setup({
      folders: ["/Chosen"],
      onDisk: ["/Chosen/report.pdf"],
    });
    const item = fakeItem();

    choose("/Chosen");
    downloads.take(item, "a");

    expect(item.savedTo).toBe("/Chosen/report (1).pdf");
  });

  it("saves it in the folder of the profile whose session started it, its own or else the app's", () => {
    const { downloads, choose } = setup({ folders: ["/App", "/Work"] });
    const items = [fakeItem(), fakeItem(), fakeItem()];

    choose("/App");
    choose("/Work", "b");
    downloads.take(items[0] ?? fakeItem(), "a");
    downloads.take(items[1] ?? fakeItem(), "b");
    downloads.take(items[2] ?? fakeItem(), undefined);

    expect(items.map((item) => item.savedTo)).toStrictEqual([
      "/App/report.pdf",
      "/Work/report.pdf",
      "/App/report (1).pdf",
    ]);
  });

  it("saves a profile's download in the system's folder while its own is missing, saying so, whatever the app's folder", () => {
    const { downloads, choose, calls } = setup({ folders: ["/App"] });
    const items = [fakeItem(), fakeItem()];

    choose("/App");
    choose("/Gone", "b");
    downloads.take(items[0] ?? fakeItem(), "b");
    downloads.take(items[1] ?? fakeItem(), "a");

    expect([
      items.map((item) => item.savedTo),
      calls.filter((call) => call.startsWith("missing")),
    ]).toStrictEqual([
      ["/Downloads/report.pdf", "/App/report.pdf"],
      ["missing /Gone"],
    ]);
  });

  it("saves it in the system's folder while the chosen one is missing or cannot be written, saying so once for each, and the chosen one again once it is back", () => {
    const folders: string[] = [];
    const { downloads, choose, calls } = setup({ folders });
    const items = [fakeItem(), fakeItem(), fakeItem(), fakeItem()];

    choose("/Gone");
    downloads.take(items[0] ?? fakeItem(), "a");
    downloads.take(items[1] ?? fakeItem(), "a");
    choose("/Other");
    downloads.take(items[2] ?? fakeItem(), "a");
    folders.push("/Other");
    downloads.take(items[3] ?? fakeItem(), "a");

    expect([
      items.map((item) => item.savedTo),
      calls.filter((call) => call.startsWith("missing")),
    ]).toStrictEqual([
      [
        "/Downloads/report.pdf",
        "/Downloads/report (1).pdf",
        "/Downloads/report (2).pdf",
        "/Other/report.pdf",
      ],
      ["missing /Gone", "missing /Other"],
    ]);
  });

  it("opens the save dialog in the system's folder while the chosen one is missing, telling of nothing, since the person picks where it goes", async () => {
    const { downloads, choose, askEachTime, calls } = setup();
    const item = fakeItem();

    choose("/Gone");
    askEachTime();
    downloads.take(item, "a");
    item.answer("/Elsewhere/report.pdf");
    await settle();

    expect([
      item.askedAt,
      calls.filter((call) => call.startsWith("missing")),
    ]).toStrictEqual(["/Downloads/report.pdf", []]);
  });

  it("shows each finished download in its folder where Settings says so, after it is quarantined, and never one that failed", async () => {
    const { downloads, showEachWhenDone, calls } = setup();
    const before = fakeItem();
    const finished = fakeItem({ fileName: "minutes.pdf" });
    const failed = fakeItem({ fileName: "agenda.pdf" });

    downloads.take(before, "a");
    before.end("completed");
    await settle();
    showEachWhenDone();
    downloads.take(finished, "a");
    downloads.take(failed, "a");
    finished.end("completed");
    failed.end("failed");
    await settle();

    expect(
      calls.filter(
        (call) => call.startsWith("show") || call.startsWith("quarantine")
      )
    ).toStrictEqual([
      "quarantine /Downloads/report.pdf",
      "quarantine /Downloads/minutes.pdf",
      "show /Downloads/minutes.pdf",
    ]);
  });

  it("asks where to save each download, offering the name it would take, and lists it under the file chosen", async () => {
    const { downloads, askEachTime, history } = setup({
      onDisk: ["/Downloads/report.pdf"],
    });
    const item = fakeItem();

    askEachTime();
    downloads.take(item, "a");
    await settle();

    const beforeAnswer = history();

    item.answer("/Elsewhere/minutes.pdf");
    await settle();

    expect([item.askedAt, beforeAnswer, history()]).toStrictEqual([
      "/Downloads/report (1).pdf",
      [],
      [
        {
          id: "d1",
          fileName: "minutes.pdf",
          path: "/Elsewhere/minutes.pdf",
          size: 1000,
          startedAt: NOW,
          state: "progressing",
        },
      ],
    ]);
  });

  it("leaves nothing listed, removed or told of once the save dialog is cancelled", async () => {
    const { downloads, askEachTime, history, calls } = setup();
    const ended: string[] = [];
    const item = fakeItem();

    downloads.onEnded(({ end }) => ended.push(end));
    askEachTime();
    downloads.take(item, "a");
    item.answer(undefined);
    await settle();

    expect([item.cancelled, history(), calls, ended]).toStrictEqual([
      true,
      [],
      [],
      [],
    ]);
  });

  it("follows a download saved where the dialog said to its end", async () => {
    const { downloads, askEachTime, history } = setup();
    const item = fakeItem();

    askEachTime();
    downloads.take(item, "a");
    item.arrive(1000);
    item.answer("/Downloads/report.pdf");
    await settle();
    item.end("completed");
    await settle();

    expect(history().map((each) => each.state)).toStrictEqual(["completed"]);
  });

  it("counts past a name on disk or held by one running, without case on macOS", () => {
    const { downloads } = setup({ onDisk: ["/Downloads/report.pdf"] });
    const first = fakeItem();
    const second = fakeItem({ fileName: "Report.PDF" });

    downloads.take(first, "a");
    downloads.take(second, "a");

    expect(first.savedTo).toBe("/Downloads/report (1).pdf");
    expect(second.savedTo).toBe("/Downloads/Report (2).PDF");
  });

  it("tells names apart by case on Linux", () => {
    const { downloads } = setup({
      platform: "linux",
      onDisk: ["/Downloads/report.pdf"],
    });
    const item = fakeItem({ fileName: "Report.pdf" });

    downloads.take(item, "a");

    expect(item.savedTo).toBe("/Downloads/Report.pdf");
  });

  it("takes only the last part of a name that reaches out of the folder", () => {
    const { downloads } = setup();
    const item = fakeItem({ fileName: "../x.pdf" });

    downloads.take(item, "a");

    expect(item.savedTo).toBe("/Downloads/x.pdf");
  });

  it("gives a name without an extension the one of its type", () => {
    const { downloads } = setup();
    const item = fakeItem({ fileName: "invoice" });

    downloads.take(item, "a");

    expect(item.savedTo).toBe("/Downloads/invoice.pdf");
  });
});

describe("the total and the button", () => {
  it("fills with the total of those running, and none once all ended", async () => {
    const { downloads, progress, land, beat } = setup();
    const first = fakeItem({ total: 1000 });
    const second = fakeItem({ fileName: "b.pdf", total: 3000 });

    downloads.take(first, "a");
    downloads.take(second, "a");
    first.arrive(1000);
    second.arrive(1000);
    beat();

    expect(progress.at(-1)).toBe(0.5);
    expect(downloads.shellSlice().button).toStrictEqual({
      kind: "running",
      progress: 0.5,
    });

    land("/Downloads/report.pdf");
    first.end("completed");
    await settle();

    // The finished one still counts toward the total of the batch.
    expect(progress.at(-1)).toBe(0.5);

    second.arrive(3000);
    second.end("completed");
    await settle();

    expect(progress.at(-1)).toBeUndefined();
  });

  it("reads the progress again while anything runs, and stops once nothing does", async () => {
    const { downloads, progress, beat, repeating } = setup();
    const item = fakeItem({ total: 1000 });

    downloads.take(item, "a");
    item.arrive(250);
    beat();

    expect(progress.at(-1)).toBe(0.25);
    expect(repeating.size).toBe(1);

    // A beat that finds nothing new leaves the Dock's bar alone.
    const told = progress.length;

    beat();

    expect(progress).toHaveLength(told);

    item.end("completed");
    await settle();

    expect(repeating.size).toBe(0);
  });

  it("reads as unknown while a size is not known", () => {
    const { downloads, progress } = setup();
    const item = fakeItem({ total: 0 });

    downloads.take(item, "a");
    item.arrive(500);

    expect(progress.at(-1)).toBeNull();
    expect(downloads.shellSlice().button).toStrictEqual({
      kind: "running",
      progress: null,
    });
  });

  it("is green once one finished with the card closed, until the card opens", async () => {
    const { downloads } = setup();
    const item = fakeItem();

    downloads.take(item, "a");
    item.end("completed");
    await settle();

    expect(downloads.shellSlice().button).toStrictEqual({ kind: "finished" });

    downloads.setOpen(true);

    expect(downloads.shellSlice().button).toStrictEqual({ kind: "plain" });

    downloads.setOpen(false);

    expect(downloads.shellSlice().button).toStrictEqual({ kind: "plain" });
  });

  it("stays plain when one finishes with the card open", async () => {
    const { downloads } = setup();
    const item = fakeItem();

    downloads.setOpen(true);
    downloads.take(item, "a");
    item.end("completed");
    await settle();
    downloads.setOpen(false);

    expect(downloads.shellSlice().button).toStrictEqual({ kind: "plain" });
  });

  it("is not green for one that failed or was cancelled", async () => {
    const { downloads } = setup();
    const failed = fakeItem();
    const cancelled = fakeItem({ fileName: "b.pdf" });

    downloads.take(failed, "a");
    downloads.take(cancelled, "a");
    failed.end("failed");
    downloads.cancel("d2");
    await settle();

    expect(downloads.shellSlice().button).toStrictEqual({ kind: "plain" });
  });
});

describe("a download ending", () => {
  it("quarantines a finished file before the Dock shows it, and keeps its size", async () => {
    const { downloads, calls, history } = setup();
    const item = fakeItem();

    downloads.take(item, "a");
    item.arrive(1200);
    item.end("completed");
    await settle();

    expect(calls).toStrictEqual([
      "quarantine /Downloads/report.pdf",
      "landed /Downloads/report.pdf",
    ]);
    expect(history()[0]).toMatchObject({ state: "completed", size: 1200 });
  });

  it("leaves the Dock still while a window of Meru has the focus", async () => {
    const { downloads, calls } = setup({ focused: true });
    const item = fakeItem();

    downloads.take(item, "a");
    item.end("completed");
    await settle();

    expect(calls).toStrictEqual(["quarantine /Downloads/report.pdf"]);
  });

  it("removes the partial file of one cancelled, which stays listed", async () => {
    const { downloads, calls, history } = setup();
    const item = fakeItem();

    downloads.take(item, "a");
    downloads.cancel("d1");
    await settle();

    expect(item.cancelled).toBeTruthy();
    expect(calls).toStrictEqual(["remove /Downloads/report.pdf"]);
    expect(history()[0]).toMatchObject({ id: "d1", state: "cancelled" });
  });

  it("lists one interrupted as failed, its partial file removed", async () => {
    const { downloads, calls, history } = setup();
    const item = fakeItem();

    downloads.take(item, "a");
    item.end("failed");
    await settle();

    expect(calls).toStrictEqual(["remove /Downloads/report.pdf"]);
    expect(history()[0]).toMatchObject({ state: "failed" });
  });

  it("tells of each as it ends, under the name it was saved as, once listed so", async () => {
    const { downloads, history } = setup();
    const told: [string, string, string, string | undefined][] = [];
    const finished = fakeItem();
    const clashing = fakeItem();

    downloads.onEnded(({ id, fileName, end }) => {
      told.push([
        id,
        fileName,
        end,
        history().find((listed) => listed.id === id)?.state,
      ]);
    });
    downloads.take(finished, "a");
    downloads.take(clashing, "a");
    finished.end("completed");
    clashing.end("failed");
    await settle();

    expect(told).toStrictEqual([
      ["d1", "report.pdf", "completed", "completed"],
      ["d2", "report (1).pdf", "failed", "failed"],
    ]);
  });
});

describe("the card", () => {
  it("lists nothing while closed, and every download newest first while open", async () => {
    const { downloads } = setup({
      entries: [entry("old", { state: "failed" })],
      onDisk: [],
    });
    const item = fakeItem({ total: 4000 });

    downloads.take(item, "a");
    item.arrive(1000);
    await settle();

    expect(downloads.shellSlice().rows).toStrictEqual([]);

    downloads.setOpen(true);
    await settle();

    expect(downloads.shellSlice().rows).toStrictEqual([
      {
        id: "d1",
        fileName: "report.pdf",
        state: "progressing",
        received: 1000,
        total: 4000,
        startedAt: NOW,
      },
      {
        id: "old",
        fileName: "old.pdf",
        state: "failed",
        received: 0,
        total: 1000,
        startedAt: NOW - 1000,
      },
    ]);
  });

  it("reads a finished file no longer there as moved or deleted when it opens", async () => {
    const { downloads } = setup({
      entries: [entry("here"), entry("moved")],
      onDisk: ["/Downloads/here.pdf"],
    });

    downloads.setOpen(true);
    await settle();

    expect(downloads.shellSlice().rows.map((row) => row.state)).toStrictEqual([
      "completed",
      "gone",
    ]);
  });

  it("opens a finished file and closes the card", async () => {
    const { downloads, calls } = setup({
      entries: [entry("here")],
      onDisk: ["/Downloads/here.pdf"],
    });

    downloads.setOpen(true);
    await settle();
    await downloads.openFile("here");

    expect(calls).toStrictEqual([
      "overlay open",
      "open /Downloads/here.pdf",
      "overlay close",
    ]);
  });

  it("marks a file gone when it is chosen and is not there, opening nothing", async () => {
    const { downloads, calls, disk } = setup({
      entries: [entry("here")],
      onDisk: ["/Downloads/here.pdf"],
    });

    downloads.setOpen(true);
    await settle();
    disk.delete("/Downloads/here.pdf");
    await downloads.openFile("here");

    expect(calls).toStrictEqual(["overlay open"]);
    expect(downloads.shellSlice().rows[0]?.state).toBe("gone");
  });

  it("shows a finished file in its folder", async () => {
    const { downloads, calls } = setup({
      entries: [entry("here")],
      onDisk: ["/Downloads/here.pdf"],
    });

    await downloads.showInFolder("here");

    expect(calls).toStrictEqual(["show /Downloads/here.pdf"]);
  });

  it("drags a finished file out of the card's document, and marks one no longer there gone", async () => {
    const { downloads, calls } = setup({
      entries: [entry("here"), entry("moved")],
      onDisk: ["/Downloads/here.pdf"],
    });

    downloads.setOpen(true);
    await settle();
    calls.length = 0;
    downloads.drag("here");
    downloads.drag("moved");

    expect(calls).toStrictEqual(["drag /Downloads/here.pdf from 7"]);
    expect(downloads.shellSlice().rows.map(({ state }) => state)).toStrictEqual(
      ["completed", "gone"]
    );
  });

  it("opens in a tab's own window, moving there from the main window and back, there being one card", async () => {
    const { downloads, calls } = setup({
      entries: [entry("here")],
      onDisk: ["/Downloads/here.pdf"],
    });
    const own = { profileId: "p", tabId: "t" };
    const where = () => {
      const { open, window } = downloads.shellSlice();

      return [open, window, downloads.isOpen()];
    };

    downloads.setOpen(true);
    downloads.setOpen(true, own);
    const inWindow = where();

    downloads.setOpen(true, own);
    downloads.setOpen(true);
    const inMain = where();

    downloads.setOpen(true, own);
    downloads.setOpen(false);
    await settle();

    expect([inWindow, inMain, where(), calls]).toStrictEqual([
      [true, own, true],
      [true, null, true],
      [false, null, false],
      ["overlay open", "overlay close", "overlay open", "overlay close"],
    ]);
  });

  it("counts a finished download as seen once the card opens in a tab's own window", async () => {
    const { downloads } = setup();
    const item = fakeItem();

    downloads.take(item, "a");
    item.end("completed");
    await settle();
    const before = downloads.shellSlice().button.kind;

    downloads.setOpen(true, { profileId: "p", tabId: "t" });

    expect([before, downloads.shellSlice().button.kind]).toStrictEqual([
      "finished",
      "plain",
    ]);
  });

  it("stays plain when one finishes with the card open in a tab's own window", async () => {
    const { downloads } = setup();
    const item = fakeItem();

    downloads.setOpen(true, { profileId: "p", tabId: "t" });
    downloads.take(item, "a");
    item.end("completed");
    await settle();
    const open = downloads.shellSlice().button.kind;

    downloads.setOpen(false);

    expect([open, downloads.shellSlice().button.kind]).toStrictEqual([
      "plain",
      "plain",
    ]);
  });

  it("opens in no window that is not open, and closes in a window only where it is", () => {
    const { downloads } = setup();
    const own = { profileId: "p", tabId: "t" };

    downloads.setOpen(true, { profileId: "p", tabId: "closed" });
    const closed = downloads.isOpen();

    downloads.setOpen(true, own);
    downloads.closeIn({ profileId: "p", tabId: "other" });
    const elsewhere = downloads.window();

    downloads.closeIn(own);

    expect([closed, elsewhere, downloads.window()]).toStrictEqual([
      false,
      own,
      undefined,
    ]);
  });

  it("tells of the window it was closed in from within, not of one losing the keys or one it moved from", () => {
    const { downloads } = setup();
    const own = { profileId: "p", tabId: "t" };
    const told: unknown[] = [];

    downloads.onClosedIn((window) => told.push(window));
    downloads.setOpen(true, own);
    downloads.closeIn(own);
    downloads.setOpen(true, own);
    downloads.setOpen(true);
    downloads.setOpen(false);
    downloads.setOpen(true, own);
    downloads.setOpen(false);

    expect(told).toStrictEqual([own]);
  });

  it("drags from the card's document in a tab's own window while it is open there", async () => {
    const { downloads, calls } = setup({
      entries: [entry("here")],
      onDisk: ["/Downloads/here.pdf"],
    });

    downloads.setOpen(true, { profileId: "p", tabId: "t" });
    await settle();
    downloads.drag("here");

    expect(calls).toStrictEqual(["drag /Downloads/here.pdf from 9"]);
  });

  it("drags nothing while the card is closed, or one not finished", async () => {
    const { downloads, calls } = setup({
      entries: [entry("here"), entry("failed", { state: "failed" })],
      onDisk: ["/Downloads/here.pdf", "/Downloads/failed.pdf"],
    });

    downloads.drag("here");
    downloads.setOpen(true);
    await settle();
    downloads.drag("failed");

    expect(calls).toStrictEqual(["overlay open"]);
  });

  it("removes one entry, but never one running", async () => {
    const { downloads, history } = setup({
      entries: [entry("a"), entry("b")],
    });

    downloads.take(fakeItem(), "a");
    await settle();
    await downloads.remove("a");
    await downloads.remove("d1");

    expect(history().map(({ id }) => id)).toStrictEqual(["d1", "b"]);
  });

  it("clears all but those running", async () => {
    const { downloads, history } = setup({
      entries: [
        entry("a"),
        entry("b", { state: "failed" }),
        entry("c", { state: "cancelled" }),
      ],
    });

    downloads.take(fakeItem(), "a");
    await settle();
    await downloads.clear();

    expect(history().map(({ id }) => id)).toStrictEqual(["d1"]);
  });
});

describe("the history over time", () => {
  it("lists those running at the last quit as cancelled at startup", async () => {
    const { downloads, history } = setup({
      entries: [entry("quit", { state: "progressing" })],
    });

    await downloads.start();

    expect(history()[0]).toMatchObject({ id: "quit", state: "cancelled" });
  });

  it("keeps running one that started before startup settled", async () => {
    const { downloads, history } = setup();

    downloads.take(fakeItem(), "a");
    await downloads.start();
    await settle();

    expect(history()[0]).toMatchObject({ id: "d1", state: "progressing" });
  });

  it("drops what started more than 30 days ago", async () => {
    const { downloads, history } = setup({
      entries: [
        entry("recent", { startedAt: NOW - DOWNLOAD_LIFETIME + 1 }),
        entry("old", { startedAt: NOW - DOWNLOAD_LIFETIME - 1 }),
      ],
    });

    await downloads.prune();

    expect(history().map(({ id }) => id)).toStrictEqual(["recent"]);
  });
});
