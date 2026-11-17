import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { noop } from "es-toolkit";

const run = promisify(execFile);

export interface Footprint {
  /** Each process's `phys_footprint`, in bytes, by pid. */
  byPid: Map<number, number>;
  /**
   * footprint's own total over the processes, which counts memory they share
   * with each other once rather than in each.
   */
  total: number;
}

interface FootprintJson {
  processes?: { pid?: unknown; footprint?: unknown }[];
  "total footprint"?: unknown;
}

/** The JSON `footprint -j` writes. */
export const parseFootprintJson = (text: string): Footprint => {
  const json = JSON.parse(text) as FootprintJson;
  const byPid = new Map<number, number>();

  for (const process of json.processes ?? []) {
    if (
      typeof process.pid === "number" &&
      typeof process.footprint === "number"
    ) {
      byPid.set(process.pid, process.footprint);
    }
  }

  const total = json["total footprint"];

  return {
    byPid,
    total:
      typeof total === "number"
        ? total
        : [...byPid.values()].reduce((sum, bytes) => sum + bytes, 0),
  };
};

/**
 * Reads the processes' physical footprint with macOS's `footprint`, which
 * reads the same `phys_footprint` the earlier probes did. Chromium's own
 * private footprint subtracts the shared memory it tracks; reaching that needs
 * a memory-infra dump over the remote debugging port, which a signed-in Google
 * session must not have open.
 */
export const readFootprint = async (pids: readonly number[]) => {
  const directory = await mkdtemp(path.join(tmpdir(), "meru-footprint-"));
  const file = path.join(directory, "footprint.json");

  try {
    // A helper that exits between listing and reading fails the command but
    // leaves the others in the file.
    await run("footprint", [
      "--noCategories",
      "-f",
      "bytes",
      "-j",
      file,
      ...pids.flatMap((pid) => ["-p", String(pid)]),
    ]).catch(noop);

    return parseFootprintJson(await readFile(file, "utf-8"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};
