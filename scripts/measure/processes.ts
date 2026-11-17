import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface ProcessEntry {
  pid: number;
  ppid: number;
  /** Seconds of CPU the process has used since it started. */
  cpuSeconds: number;
  command: string;
}

/** `ps`'s `time` column: `[[dd-]hh:]mm:ss.cc`. */
export const parseCpuTime = (text: string) => {
  const [days, clock] = text.includes("-") ? text.split("-") : ["0", text];
  const parts = (clock ?? "").split(":").map(Number);
  const seconds = parts.reduce((total, part) => total * 60 + part, 0);

  return Number(days) * 86_400 + seconds;
};

/** Rows of `ps -axww -o pid=,ppid=,time=,command=`. */
export const parsePs = (output: string): ProcessEntry[] =>
  output.split("\n").flatMap((line) => {
    const groups =
      /^\s*(?<pid>\d+)\s+(?<ppid>\d+)\s+(?<time>\S+)\s+(?<command>.*)$/u.exec(
        line
      )?.groups;

    if (!(groups?.pid && groups.ppid && groups.time && groups.command)) {
      return [];
    }

    return [
      {
        pid: Number(groups.pid),
        ppid: Number(groups.ppid),
        cpuSeconds: parseCpuTime(groups.time),
        command: groups.command,
      },
    ];
  });

export const listProcesses = async () => {
  const { stdout } = await run("ps", [
    "-axww",
    "-o",
    "pid=,ppid=,time=,command=",
  ]);

  return parsePs(stdout);
};

/** The root and every process under it. */
export const treeOf = (entries: readonly ProcessEntry[], rootPid: number) => {
  const tree = entries.filter((entry) => entry.pid === rootPid);
  const pids = new Set(tree.map((entry) => entry.pid));
  let grew = tree.length > 0;

  while (grew) {
    grew = false;

    for (const entry of entries) {
      if (!pids.has(entry.pid) && pids.has(entry.ppid)) {
        pids.add(entry.pid);
        tree.push(entry);
        grew = true;
      }
    }
  }

  return tree;
};

type ProcessKind =
  | "browser"
  | "gpu"
  | "network"
  | "utility"
  | "renderer"
  | "other";

export interface ProcessType {
  kind: ProcessKind;
  /** What kind of utility, such as `storage`, when Chromium says. */
  detail?: string;
}

/** What Chromium's `--type` and `--utility-sub-type` switches say a helper is. */
export const processTypeOf = (
  entry: Pick<ProcessEntry, "pid" | "command">,
  rootPid: number
): ProcessType => {
  if (entry.pid === rootPid) {
    return { kind: "browser" };
  }

  const type = /--type=(?<type>\S+)/u.exec(entry.command)?.groups?.type;

  if (type === "gpu-process") {
    return { kind: "gpu" };
  }

  if (type === "renderer") {
    return { kind: "renderer" };
  }

  if (type === "utility") {
    const subType =
      /--utility-sub-type=(?<subType>\S+)/u.exec(entry.command)?.groups
        ?.subType ?? "";

    if (subType === "network.mojom.NetworkService") {
      return { kind: "network" };
    }

    // `storage.mojom.StorageService` reads as `storage`.
    return { kind: "utility", detail: subType.split(".")[0] || "unknown" };
  }

  return { kind: "other", detail: type ?? "unknown" };
};
