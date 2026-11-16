/*
 * An app's processes, found from the outside, so teardown can end every one of
 * them. On Windows Playwright starts Electron through cmd.exe, so the pid it
 * holds is the shell's, and a process left running keeps the user data
 * directory's files open, which Windows then refuses to delete.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { delay } from "es-toolkit";

const run = promisify(execFile);

/**
 * A pid alone names a process only until it exits: Windows hands pids out
 * again within seconds. With its start time it names one process for good.
 */
export interface ProcessEntry {
  pid: number;
  ppid: number;
  startedAt: number;
}

const LIST_WINDOWS =
  'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.Ticks)" }';

const listProcesses = async (): Promise<ProcessEntry[]> => {
  const isWindows = process.platform === "win32";
  const { stdout } = isWindows
    ? await run(
        "powershell",
        ["-NoProfile", "-NonInteractive", "-Command", LIST_WINDOWS],
        { maxBuffer: 16 * 1024 * 1024 }
      )
    : await run("ps", ["-A", "-o", "pid=,ppid=,lstart="], {
        maxBuffer: 16 * 1024 * 1024,
      });

  return stdout.split("\n").flatMap((line) => {
    const groups = /^\s*(?<pid>\d+)\s+(?<ppid>\d+)\s+(?<start>.+?)\s*$/u.exec(
      line
    )?.groups;

    if (!(groups?.pid && groups.ppid && groups.start)) {
      return [];
    }

    // Windows gives ticks; ps a date such as "Mon Nov 16 16:52:03 2026".
    const startedAt = isWindows
      ? Number(groups.start)
      : Date.parse(groups.start);

    return Number.isNaN(startedAt)
      ? []
      : [{ pid: Number(groups.pid), ppid: Number(groups.ppid), startedAt }];
  });
};

const isSame = (a: ProcessEntry, b: ProcessEntry) =>
  a.pid === b.pid && a.startedAt === b.startedAt;

/**
 * The root and its descendants among `processes`. A child must have started no
 * earlier than its parent: Windows never rewrites a parent id, so an orphan can
 * name a pid that now belongs to an unrelated process.
 */
const descendTree = (rootPid: number, processes: ProcessEntry[]) => {
  const tree = processes.filter(({ pid }) => pid === rootPid);

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

/**
 * The process and all it has started so far. Read it before asking the app to
 * quit: once a parent exits, its children are reparented and nothing leads to
 * them from the pid any more.
 */
export const readProcessTree = async (rootPid: number) =>
  descendTree(rootPid, await listProcesses());

/** Which of these processes are still running, by pid and start time. */
const survivorsOf = async (tree: readonly ProcessEntry[]) => {
  const processes = await listProcesses();

  return processes.filter((entry) =>
    tree.some((member) => isSame(member, entry))
  );
};

const EXIT_TIMEOUT_MS = 15_000;

const EXIT_POLL_MS = 100;

const waitForExit = async (
  tree: readonly ProcessEntry[],
  giveUpAt: number
): Promise<void> => {
  const survivors = await survivorsOf(tree);

  if (survivors.length === 0) {
    return;
  }

  if (Date.now() > giveUpAt) {
    throw new Error(
      `Processes ${survivors.map(({ pid }) => pid).join(", ")} were still running ${EXIT_TIMEOUT_MS} ms after being killed`
    );
  }

  await delay(EXIT_POLL_MS);

  return waitForExit(tree, giveUpAt);
};

/**
 * Kills whatever of the tree is still running, matched by pid and start time so
 * a reused pid is never hit, and waits until all of it has gone. Throws, naming
 * the pids, when something outlives the wait.
 */
export const killProcessTree = async (tree: readonly ProcessEntry[]) => {
  const [root] = tree;
  const processes = await listProcesses();
  const targets = [
    ...processes.filter((entry) =>
      tree.some((member) => isSame(member, entry))
    ),
    // Anything the root has started since the tree was read.
    ...(root && processes.some((entry) => isSame(entry, root))
      ? descendTree(root.pid, processes)
      : []),
  ];

  for (const { pid } of targets) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // It exited on its own in the meantime.
    }
  }

  await waitForExit([...tree, ...targets], Date.now() + EXIT_TIMEOUT_MS);
};
