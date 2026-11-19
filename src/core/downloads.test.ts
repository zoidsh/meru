import { describe, expect, it } from "vitest";

import {
  DOWNLOAD_LIFETIME,
  addDownload,
  clearable,
  downloads,
  expired,
  nameKey,
  relativeTime,
  removeDownloads,
  settledAtStart,
  sizeUnit,
  totalProgress,
  unusedName,
  updateDownload,
  withExtension,
} from "./downloads.ts";
import type { DownloadEntry } from "./downloads.ts";
import { decodeState, encodeState } from "./state.ts";
import type { State } from "./state.ts";

const entry = (
  id: string,
  change: Partial<DownloadEntry> = {}
): DownloadEntry => ({
  id,
  fileName: `${id}.pdf`,
  path: `/Downloads/${id}.pdf`,
  size: 1000,
  startedAt: 1_000_000,
  state: "completed",
  ...change,
});

const stateWith = (downloadsValue?: unknown): State => {
  const decoded = decodeState({
    version: 1,
    profiles: [{ id: "p1", name: "Default" }],
    ...(downloadsValue !== undefined && { downloads: downloadsValue }),
  });

  if (decoded.kind !== "read") {
    throw new Error("The state did not decode");
  }

  return decoded.value;
};

describe("the history in the state", () => {
  it("reads none from a file without it, and writes it once added", () => {
    const state = stateWith();

    expect(downloads(state)).toStrictEqual([]);

    const added = addDownload(state, entry("a"));

    expect(downloads(added)).toStrictEqual([entry("a")]);
    expect(encodeState(added)).toMatchObject({ downloads: [entry("a")] });
  });

  it("keeps an entry it cannot read where it was, unshown", () => {
    const state = stateWith([entry("a"), { id: "b" }, entry("c")]);

    expect(downloads(state).map((each) => each.id)).toStrictEqual(["a", "c"]);

    const removed = removeDownloads(state, (each) => each.id === "a");

    expect(removed && encodeState(removed)).toMatchObject({
      downloads: [{ id: "b" }, entry("c")],
    });
  });

  it("reads a history that is not a list as none and keeps it until added to", () => {
    const state = stateWith("garbage");

    expect(downloads(state)).toStrictEqual([]);
    expect(encodeState(state)).toMatchObject({ downloads: "garbage" });
    expect(downloads(addDownload(state, entry("a")))).toStrictEqual([
      entry("a"),
    ]);
  });

  it("shows the first of two entries with one id and changes only it", () => {
    const state = stateWith([entry("a"), entry("a", { fileName: "later" })]);

    expect(downloads(state)).toStrictEqual([entry("a")]);

    const updated = updateDownload(state, "a", { state: "failed" });

    expect(updated && encodeState(updated)).toMatchObject({
      downloads: [
        { id: "a", state: "failed" },
        { id: "a", fileName: "later", state: "completed" },
      ],
    });
  });

  it("keeps a key a later build added to an entry", () => {
    const state = stateWith([{ ...entry("a"), later: 1 }]);
    const updated = updateDownload(state, "a", { state: "failed" });

    expect(updated && encodeState(updated)).toMatchObject({
      downloads: [{ id: "a", later: 1, state: "failed" }],
    });
  });

  it("changes nothing for an id it does not show", () => {
    const state = stateWith([entry("a")]);

    expect(updateDownload(state, "b", { state: "failed" })).toBeUndefined();
    expect(removeDownloads(state, () => false)).toBeUndefined();
  });

  it("reads a download running at quit as cancelled at the next start", () => {
    const state = stateWith([entry("a", { state: "progressing" }), entry("b")]);
    const settled = settledAtStart(state);

    expect(
      settled && downloads(settled).map((each) => each.state)
    ).toStrictEqual(["cancelled", "completed"]);
    expect(settledAtStart(stateWith([entry("b")]))).toBeUndefined();
  });
});

describe("the history's rules", () => {
  it("keeps an entry 30 days from its start", () => {
    const start = entry("a").startedAt;

    expect(expired(entry("a"), start + DOWNLOAD_LIFETIME - 1)).toBeFalsy();
    expect(expired(entry("a"), start + DOWNLOAD_LIFETIME)).toBeTruthy();
  });

  it("clears everything but a running download", () => {
    expect(clearable({ state: "completed" })).toBeTruthy();
    expect(clearable({ state: "failed" })).toBeTruthy();
    expect(clearable({ state: "cancelled" })).toBeTruthy();
    expect(clearable({ state: "progressing" })).toBeFalsy();
  });
});

const takenOf = (...names: string[]) => {
  const taken = new Set(names);

  return (name: string) => taken.has(name);
};

describe("naming a download", () => {
  it("keeps a name that is free", () => {
    expect(unusedName("a.pdf", takenOf())).toBe("a.pdf");
  });

  it("counts up before the extension", () => {
    expect(unusedName("a.pdf", takenOf("a.pdf"))).toBe("a (1).pdf");
    expect(unusedName("a.pdf", takenOf("a.pdf", "a (1).pdf"))).toBe(
      "a (2).pdf"
    );
  });

  it("keeps a compound extension whole", () => {
    expect(unusedName("a.tar.gz", takenOf("a.tar.gz"))).toBe("a (1).tar.gz");
    expect(unusedName("a.TAR.xz", takenOf("a.TAR.xz"))).toBe("a (1).TAR.xz");
  });

  it("puts only the last part of a dotted name after the counter", () => {
    expect(unusedName("q3.report.pdf", takenOf("q3.report.pdf"))).toBe(
      "q3.report (1).pdf"
    );
  });

  it("keeps a number in brackets the name already has, as Chrome does", () => {
    expect(
      unusedName("Tax return (2023).pdf", takenOf("Tax return (2023).pdf"))
    ).toBe("Tax return (2023) (1).pdf");
  });

  it("names one without an extension, or hidden, by its whole name", () => {
    expect(unusedName("README", takenOf("README"))).toBe("README (1)");
    expect(unusedName(".env", takenOf(".env"))).toBe(".env (1)");
  });

  it("compares names without case on macOS and Windows", () => {
    expect(nameKey("A.PDF", "darwin")).toBe("a.pdf");
    expect(nameKey("A.PDF", "win32")).toBe("a.pdf");
    expect(nameKey("A.PDF", "linux")).toBe("A.PDF");
  });

  it("adds the extension its type has to a name without one", () => {
    expect(withExtension("report", "application/pdf")).toBe("report.pdf");
    expect(withExtension("photo", "IMAGE/JPEG; charset=binary")).toBe(
      "photo.jpg"
    );
    expect(withExtension("report.pdf", "text/plain")).toBe("report.pdf");
    expect(withExtension("blob", "application/x-unknown")).toBe("blob");
  });
});

describe("total progress", () => {
  it("is nothing with nothing running", () => {
    expect(totalProgress([], 500)).toBeUndefined();
  });

  it("is not known while a size is not", () => {
    expect(
      totalProgress(
        [
          { received: 5, total: 10 },
          { received: 5, total: 0 },
        ],
        0
      )
    ).toBeNull();
  });

  it("sums every running download with those finished meanwhile", () => {
    expect(
      totalProgress(
        [
          { received: 10, total: 40 },
          { received: 0, total: 40 },
        ],
        20
      )
    ).toBe(0.3);
  });
});

describe("relative time", () => {
  const today = new Date(2026, 10, 19).getTime();
  const now = today + 15 * 60 * 60_000;

  it("reads within a minute as now", () => {
    expect(relativeTime(now - 59_000, now, today)).toStrictEqual({
      value: 0,
      unit: "second",
    });
  });

  it("counts minutes, then hours today", () => {
    expect(relativeTime(now - 5 * 60_000, now, today)).toStrictEqual({
      value: -5,
      unit: "minute",
    });
    expect(relativeTime(now - 2.5 * 60 * 60_000, now, today)).toStrictEqual({
      value: -2,
      unit: "hour",
    });
  });

  it("counts days by the calendar before today", () => {
    expect(relativeTime(today - 60_000, now, today)).toStrictEqual({
      value: -1,
      unit: "day",
    });
    expect(relativeTime(today - 30 * 60 * 60_000, now, today)).toStrictEqual({
      value: -2,
      unit: "day",
    });
  });
});

describe("size units", () => {
  it("counts in thousands", () => {
    expect(sizeUnit(999)).toStrictEqual({ unit: "byte", divisor: 1 });
    expect(sizeUnit(48_000_000)).toStrictEqual({
      unit: "megabyte",
      divisor: 1_000_000,
    });
    expect(sizeUnit(5e12).unit).toBe("gigabyte");
  });
});
