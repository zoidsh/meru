/*
 * The processes a launched app is made of, found from the outside.
 *
 * The one process Playwright hands back is not the app on every platform. On
 * Windows it starts Electron through cmd.exe, so `app.process()` is the shell,
 * and Meru.exe and the Chromium processes under it are its descendants. Killing
 * that one process leaves every one of them running, holding the files in the
 * user data directory open, and Windows refuses to delete a file that is open.
 */
import { execFile } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const EXIT_POLL_INTERVAL = 100;

type ProcessEntry = {
  pid: number;
  ppid: number;
  /**
   * When the process started. A pid alone does not name a process for long:
   * Windows hands a freed one out again within seconds, and waiting on a pid
   * that now belongs to something else would wait until the test timed out.
   */
  startedAt: number;
};

async function listProcesses(): Promise<ProcessEntry[]> {
  const { stdout } =
    process.platform === "win32"
      ? await execFileAsync("powershell", [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          'Get-CimInstance Win32_Process | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $($_.CreationDate.Ticks)" }',
        ])
      : await execFileAsync("ps", ["-A", "-o", "pid=,ppid=,lstart="]);

  return stdout.split("\n").flatMap((line) => {
    const match = /^\s*(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);

    if (!match) {
      return [];
    }

    // Windows prints ticks; ps prints a date such as "Thu Oct  1 16:52:03 2026".
    const startedAt =
      process.platform === "win32" ? Number(match[3]) : Date.parse(match[3] as string);

    return Number.isNaN(startedAt)
      ? []
      : [{ pid: Number(match[1]), ppid: Number(match[2]), startedAt }];
  });
}

/**
 * The process and every descendant it has right now.
 *
 * Read before the app is asked to quit, not after, because a parent that has
 * exited no longer leads anywhere: Linux and macOS reparent its children, and on
 * Windows nothing walks to them from the pid the runner holds.
 *
 * A child has to have started after its parent. Windows never updates a
 * process's parent id, so one whose parent has exited can name a pid that has
 * since gone to the app. Killed as part of the tree, such a stranger can be the
 * console host the runner's own processes share, after which none of them can
 * start.
 */
export async function readProcessTree(rootPid: number) {
  const processes = await listProcesses();

  const tree = processes.filter(({ pid }) => pid === rootPid);

  for (let index = 0; index < tree.length; index++) {
    const parent = tree[index] as ProcessEntry;

    tree.push(
      ...processes.filter(
        ({ ppid, startedAt }) => ppid === parent.pid && startedAt >= parent.startedAt,
      ),
    );
  }

  return tree;
}

export function killProcesses(tree: ProcessEntry[]) {
  for (const { pid } of tree) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Already gone, which is what the kill was for.
    }
  }
}

/**
 * Resolves once none of the processes is running, however long that takes,
 * since the files they hold stay locked until then. A test that has to wait too
 * long runs into its own timeout, which is the right place for that failure.
 */
export async function waitForProcessesToExit(tree: ProcessEntry[]) {
  const isInTree = ({ pid, startedAt }: ProcessEntry) =>
    tree.some((entry) => entry.pid === pid && entry.startedAt === startedAt);

  while ((await listProcesses()).some(isInTree)) {
    await sleep(EXIT_POLL_INTERVAL);
  }
}
