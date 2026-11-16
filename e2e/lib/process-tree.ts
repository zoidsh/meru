/*
 * An app's processes, found from the outside. On Windows Playwright starts
 * Electron through cmd.exe, so the pid it holds is the shell's; and once the
 * main process has died, nothing leads from its pid to the helpers it left.
 * A process left running keeps the user data directory's files open, which
 * Windows then refuses to delete.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { delay } from "es-toolkit";

const run = promisify(execFile);

/**
 * Windows hands a freed pid out again within seconds, so a process is named by
 * its pid and start time together.
 */
export interface ProcessEntry {
  pid: number;
  ppid: number;
  startedAt: number;
  commandLine: string;
}

const LIST_WINDOWS =
  "Get-CimInstance Win32_Process | ForEach-Object { [pscustomobject]@{ pid = $_.ProcessId; ppid = $_.ParentProcessId; startedAt = $_.CreationDate.Ticks; commandLine = [string]$_.CommandLine } } | ConvertTo-Json -Compress";

const MAX_BUFFER = 64 * 1024 * 1024;

const listWindows = async (): Promise<ProcessEntry[]> => {
  const { stdout } = await run(
    "powershell",
    ["-NoProfile", "-NonInteractive", "-Command", LIST_WINDOWS],
    { maxBuffer: MAX_BUFFER }
  );

  return JSON.parse(stdout) as ProcessEntry[];
};

// `lstart` is always five fields, such as "Mon Nov 16 16:52:03 2026".
const PS_LINE =
  /^\s*(?<pid>\d+)\s+(?<ppid>\d+)\s+(?<start>\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+(?<args>.*)$/u;

const listUnix = async (): Promise<ProcessEntry[]> => {
  const { stdout } = await run(
    "ps",
    ["-A", "-ww", "-o", "pid=,ppid=,lstart=,args="],
    {
      maxBuffer: MAX_BUFFER,
    }
  );

  return stdout.split("\n").flatMap((line) => {
    const groups = PS_LINE.exec(line)?.groups;
    const startedAt = Date.parse(groups?.start ?? "");

    return groups?.pid && groups.ppid && !Number.isNaN(startedAt)
      ? [
          {
            pid: Number(groups.pid),
            ppid: Number(groups.ppid),
            startedAt,
            commandLine: groups.args ?? "",
          },
        ]
      : [];
  });
};

const listProcesses = () =>
  process.platform === "win32" ? listWindows() : listUnix();

const isSame = (a: ProcessEntry, b: ProcessEntry) =>
  a.pid === b.pid && a.startedAt === b.startedAt;

/**
 * A child must have started no earlier than its parent: Windows never rewrites
 * a parent id, so an orphan can name a pid that now belongs to a stranger.
 */
const descendTree = (root: ProcessEntry, processes: ProcessEntry[]) => {
  const tree = processes.filter((entry) => isSame(entry, root));

  for (const parent of tree) {
    tree.push(
      ...processes.filter(
        (entry) =>
          entry.ppid === parent.pid &&
          entry.startedAt >= parent.startedAt &&
          !tree.some((member) => isSame(member, entry))
      )
    );
  }

  return tree;
};

/** Read straight after launch, while the pid still names the process. */
export const readProcess = async (pid: number) => {
  const processes = await listProcesses();

  return processes.find((entry) => entry.pid === pid);
};

/**
 * What identifies an app's processes: the root it was launched as, and an
 * argument every one of its processes carries, which Chromium passes on to its
 * helpers. The argument finds them after the root has died.
 */
export interface AppProcesses {
  root: ProcessEntry | undefined;
  argument: string | undefined;
}

const carries = (entry: ProcessEntry, argument: string) => {
  const at = entry.commandLine.indexOf(argument);
  const next = entry.commandLine[at + argument.length];

  return at !== -1 && (next === undefined || next === " " || next === '"');
};

const findAll = async ({ root, argument }: AppProcesses) => {
  const processes = await listProcesses();
  const found = [
    ...(root ? descendTree(root, processes) : []),
    ...(argument
      ? processes.filter(
          (entry) => entry.pid !== process.pid && carries(entry, argument)
        )
      : []),
  ];

  return found.filter(
    (entry, index) => found.findIndex((other) => isSame(other, entry)) === index
  );
};

const EXIT_TIMEOUT_MS = 15_000;

const EXIT_POLL_MS = 100;

const waitForExit = async (
  app: AppProcesses,
  giveUpAt: number
): Promise<void> => {
  const survivors = await findAll(app);

  if (survivors.length === 0) {
    return;
  }

  if (Date.now() > giveUpAt) {
    throw new Error(
      `Processes ${survivors.map(({ pid }) => pid).join(", ")} were still running ${EXIT_TIMEOUT_MS} ms after being killed`
    );
  }

  for (const { pid } of survivors) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // It exited on its own in the meantime.
    }
  }

  await delay(EXIT_POLL_MS);

  return waitForExit(app, giveUpAt);
};

/** Throws, naming them, when processes outlive the wait. */
export const killApp = (app: AppProcesses) =>
  waitForExit(app, Date.now() + EXIT_TIMEOUT_MS);
