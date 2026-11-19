import { setImmediate as nextTurn } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import { DOWNLOAD_LIFETIME, downloads as historyOf } from "#core/downloads.ts";
import type { DownloadEntry } from "#core/downloads.ts";
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
  cancelled: boolean;
  /** Bytes in so far, as a progress event tells. */
  arrive: (bytes: number) => void;
  end: (how: DownloadEnd) => void;
}

/** A download its session hands over, driven by the test. */
const fakeItem = ({
  fileName = "report.pdf",
  mimeType = "application/pdf",
  total = 1000,
}: { fileName?: string; mimeType?: string; total?: number } = {}) => {
  const progress = new Set<() => void>();
  const done = new Set<(end: DownloadEnd) => void>();
  let received = 0;
  const item: FakeItem = {
    fileName,
    mimeType,
    startedAt: NOW,
    savedTo: undefined,
    cancelled: false,
    received: () => received,
    total: () => total,
    saveTo: (file) => {
      item.savedTo = file;
    },
    cancel: () => {
      item.cancelled = true;
      item.end("cancelled");
    },
    onProgress: (listener) => {
      progress.add(listener);
    },
    onDone: (listener) => {
      done.add(listener);
    },
    arrive: (bytes) => {
      received = bytes;

      for (const listener of progress) {
        listener();
      }
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
}: {
  entries?: DownloadEntry[];
  platform?: Platform;
  onDisk?: string[];
  focused?: boolean;
} = {}) => {
  let state = initial(entries);
  let open = false;
  let ids = 0;
  let saving: Promise<unknown> = Promise.resolve();
  const disk = new Set(onDisk);
  const repeating = new Set<() => void>();
  const calls: string[] = [];
  const progress: (number | null | undefined)[] = [];
  const files: DownloadFiles = {
    folder: () => FOLDER,
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
    log: (message) => {
      calls.push(`log ${message}`);
    },
  });

  /** Lets every save and file check that is under way finish. */

  return {
    downloads,
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

    downloads.take(item);
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

  it("counts past a name on disk or held by one running, without case on macOS", () => {
    const { downloads } = setup({ onDisk: ["/Downloads/report.pdf"] });
    const first = fakeItem();
    const second = fakeItem({ fileName: "Report.PDF" });

    downloads.take(first);
    downloads.take(second);

    expect(first.savedTo).toBe("/Downloads/report (1).pdf");
    expect(second.savedTo).toBe("/Downloads/Report (2).PDF");
  });

  it("tells names apart by case on Linux", () => {
    const { downloads } = setup({
      platform: "linux",
      onDisk: ["/Downloads/report.pdf"],
    });
    const item = fakeItem({ fileName: "Report.pdf" });

    downloads.take(item);

    expect(item.savedTo).toBe("/Downloads/Report.pdf");
  });

  it("gives a name without an extension the one of its type", () => {
    const { downloads } = setup();
    const item = fakeItem({ fileName: "invoice" });

    downloads.take(item);

    expect(item.savedTo).toBe("/Downloads/invoice.pdf");
  });
});

describe("the total and the button", () => {
  it("fills with the total of those running, and none once all ended", async () => {
    const { downloads, progress, land } = setup();
    const first = fakeItem({ total: 1000 });
    const second = fakeItem({ fileName: "b.pdf", total: 3000 });

    downloads.take(first);
    downloads.take(second);
    first.arrive(1000);
    second.arrive(1000);

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

    downloads.take(item);
    // Arrived with no progress event, as before Chromium writes it.
    item.received = () => 250;
    beat();

    expect(progress.at(-1)).toBe(0.25);
    expect(repeating.size).toBe(1);

    item.end("completed");
    await settle();

    expect(repeating.size).toBe(0);
  });

  it("reads as unknown while a size is not known", () => {
    const { downloads, progress } = setup();
    const item = fakeItem({ total: 0 });

    downloads.take(item);
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

    downloads.take(item);
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
    downloads.take(item);
    item.end("completed");
    await settle();
    downloads.setOpen(false);

    expect(downloads.shellSlice().button).toStrictEqual({ kind: "plain" });
  });

  it("is not green for one that failed or was cancelled", async () => {
    const { downloads } = setup();
    const failed = fakeItem();
    const cancelled = fakeItem({ fileName: "b.pdf" });

    downloads.take(failed);
    downloads.take(cancelled);
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

    downloads.take(item);
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

    downloads.take(item);
    item.end("completed");
    await settle();

    expect(calls).toStrictEqual(["quarantine /Downloads/report.pdf"]);
  });

  it("removes the partial file of one cancelled, which stays listed", async () => {
    const { downloads, calls, history } = setup();
    const item = fakeItem();

    downloads.take(item);
    downloads.cancel("d1");
    await settle();

    expect(item.cancelled).toBeTruthy();
    expect(calls).toStrictEqual(["remove /Downloads/report.pdf"]);
    expect(history()[0]).toMatchObject({ id: "d1", state: "cancelled" });
  });

  it("lists one interrupted as failed, its partial file removed", async () => {
    const { downloads, calls, history } = setup();
    const item = fakeItem();

    downloads.take(item);
    item.end("failed");
    await settle();

    expect(calls).toStrictEqual(["remove /Downloads/report.pdf"]);
    expect(history()[0]).toMatchObject({ state: "failed" });
  });
});

describe("the card", () => {
  it("lists nothing while closed, and every download newest first while open", async () => {
    const { downloads } = setup({
      entries: [entry("old", { state: "failed" })],
      onDisk: [],
    });
    const item = fakeItem({ total: 4000 });

    downloads.take(item);
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

  it("removes one entry, but never one running", async () => {
    const { downloads, history } = setup({
      entries: [entry("a"), entry("b")],
    });

    downloads.take(fakeItem());
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

    downloads.take(fakeItem());
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

    downloads.take(fakeItem());
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
