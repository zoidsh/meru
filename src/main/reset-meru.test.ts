import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { recordInto } from "#core/log.fake.ts";
import { nodeUserDataFiles } from "#platform/user-data-files.ts";
import type { UserDataFiles } from "#platform/user-data-files.ts";

import {
  RESET_MARKER,
  createResetMeru,
  resetConfirmation,
  wipeAfterReset,
} from "./reset-meru.ts";

const DETAIL =
  "You'll be signed out of every profile and lose all your settings. This can't be undone.";

/** Each step the reset takes, in order, against fakes of what it is given. */
const resetWith = ({
  confirms = true,
  licensed = false,
  licenseRemoved = true,
  markerWritten = true,
} = {}) => {
  const steps: string[] = [];
  const lines: string[] = [];
  const reset = createResetMeru({
    confirm: (confirmation) => {
      steps.push(`confirm: ${confirmation.detail}`);

      return Promise.resolve(confirms);
    },
    hasLicense: () => licensed,
    removeLicense: () => {
      steps.push("remove license");

      return Promise.resolve(licenseRemoved);
    },
    writeMarker: () => {
      steps.push("write marker");

      return markerWritten
        ? Promise.resolve()
        : Promise.reject(
            Object.assign(new Error("ENOSPC: no space left on device"), {
              code: "ENOSPC",
            })
          );
    },
    relaunch: () => {
      steps.push("relaunch");
    },
    log: recordInto(lines),
  });

  return { reset, steps, lines };
};

describe("the reset's confirmation", () => {
  it("asks with the system's alert, Cancel the default, saying what goes", () => {
    expect(resetConfirmation(false)).toStrictEqual({
      message: "Reset Meru?",
      detail: DETAIL,
      confirmLabel: "Reset",
      cancelLabel: "Cancel",
    });
  });

  it("says in a second paragraph that the license goes too while one is stored", () => {
    expect(resetConfirmation(true).detail).toBe(
      `${DETAIL}\n\nThis also removes your Meru Pro license from this device. You can activate it again with your key.`
    );
  });
});

describe(createResetMeru, () => {
  it("does nothing once canceled", async () => {
    const { reset, steps, lines } = resetWith({ confirms: false });

    await expect(reset()).resolves.toBe("canceled");
    expect(steps).toStrictEqual([`confirm: ${DETAIL}`]);
    expect(lines).toStrictEqual([]);
  });

  it("removes the license, then writes the marker, then relaunches", async () => {
    const { reset, steps, lines } = resetWith({ licensed: true });

    await expect(reset()).resolves.toBe("resetting");
    expect(steps).toStrictEqual([
      expect.stringContaining("This also removes your Meru Pro license"),
      "remove license",
      "write marker",
      "relaunch",
    ]);
    expect(lines).toStrictEqual(["meru-reset-confirmed"]);
  });

  it("stops before the marker when the license could not be removed", async () => {
    const { reset, steps, lines } = resetWith({ licenseRemoved: false });

    await expect(reset()).resolves.toBe("failed");
    expect(steps.slice(1)).toStrictEqual(["remove license"]);
    expect(lines).toStrictEqual([
      "meru-reset-confirmed",
      "meru-reset-failed step=license",
    ]);
  });

  it("stops before the relaunch when the marker could not be written", async () => {
    const { reset, steps, lines } = resetWith({ markerWritten: false });

    await expect(reset()).resolves.toBe("failed");
    expect(steps.slice(1)).toStrictEqual(["remove license", "write marker"]);
    expect(lines).toStrictEqual([
      "meru-reset-confirmed",
      "meru-reset-failed step=marker code=ENOSPC",
    ]);
  });
});

let folder: string;

/** Each file, as a path under the folder with `/` between its parts. */
const tree = async (dir = folder): Promise<string[]> => {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path
        .relative(folder, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/")
    )
    .toSorted();
};

const put = async (...files: string[]) => {
  for (const file of files) {
    const full = path.join(folder, ...file.split("/"));

    // oxlint-disable-next-line no-await-in-loop -- one file after another
    await mkdir(path.dirname(full), { recursive: true });
    // oxlint-disable-next-line no-await-in-loop -- one file after another
    await writeFile(full, file);
  }
};

/** A user data folder as a run of Meru leaves it, two profiles signed in. */
const KEPT = [
  "Cache/Cache_Data/index",
  "Code Cache/js/index",
  "Crashpad/settings.dat",
  "Downloads/report.pdf",
  "GPUCache/index",
  "Local State",
  "entitlement-stub.json",
  "entitlement.json",
];

const WIPED = [
  "IndexedDB/meru-app_shell_0.indexeddb.leveldb/CURRENT",
  "Local Storage/leveldb/000003.log",
  "Network/Cookies",
  "Partitions/home/Cookies",
  "Partitions/home/Preferences",
  "Partitions/work/Cache/Cache_Data/index",
  "Partitions/work/Cookies",
  "Partitions/work/Local Storage/leveldb/000003.log",
  "Preferences",
  "Session Storage/000003.log",
  "entitlement.corrupt-1764000000000.json",
  "gmail-user-styles.css",
  "logs/main.log",
  "settings.corrupt-1764000000000.json",
  "settings.json",
  "settings.json.tmp",
  "state.corrupt-1764000000000.json",
  "state.json",
];

const wipe = (files: UserDataFiles = nodeUserDataFiles) => {
  const lines: string[] = [];
  const ran = wipeAfterReset({
    userDataPath: folder,
    files,
    log: recordInto(lines, { dataDir: folder }),
  });

  return { ran, lines };
};

describe("the wipe after a reset", () => {
  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "meru-reset-"));
    await put(...KEPT, ...WIPED);
  });

  afterEach(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it("does nothing without the marker", async () => {
    expect(wipe()).toStrictEqual({ ran: false, lines: [] });
    await expect(tree()).resolves.toStrictEqual([...KEPT, ...WIPED].toSorted());
  });

  it("deletes every profile's session, the stores, the user styles, the logs and the default session's storage, and keeps the entitlement, the caches and the downloads", async () => {
    await put(RESET_MARKER);

    expect(wipe()).toStrictEqual({
      ran: true,
      lines: ["meru-reset-wiped kept=0"],
    });
    await expect(tree()).resolves.toStrictEqual(KEPT);
    await expect(readdir(folder)).resolves.not.toContain("Partitions");
  });

  it("removes the marker last, so a wipe cut short runs again", async () => {
    await put(RESET_MARKER);

    const removed: string[] = [];

    wipe({
      ...nodeUserDataFiles,
      remove: (target) => {
        removed.push(path.basename(target));
        nodeUserDataFiles.remove(target);
      },
    });

    expect(removed.at(-1)).toBe(RESET_MARKER);
    expect(removed).toHaveLength(new Set(removed).size);
  });

  it("logs a file that will not go, deletes all else beside it, and goes on", async () => {
    await put(RESET_MARKER);

    const held = path.join(folder, "Partitions", "work", "Cookies");
    const holding: UserDataFiles = {
      ...nodeUserDataFiles,
      remove: (target) => {
        if (held.startsWith(target)) {
          throw Object.assign(new Error(`EBUSY: resource busy, '${target}'`), {
            code: "EBUSY",
          });
        }

        nodeUserDataFiles.remove(target);
      },
    };

    expect(wipe(holding)).toStrictEqual({
      ran: true,
      lines: [
        "meru-reset-wiped kept=1",
        "reset-delete-failed path=<data>/Partitions/work/Cookies code=EBUSY",
      ],
    });
    await expect(tree()).resolves.toStrictEqual(
      [...KEPT, "Partitions/work/Cookies"].toSorted()
    );
  });
});
