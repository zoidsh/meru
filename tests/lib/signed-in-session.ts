/*
 * Keeps the signed-in profile signed in across the runs that copy it.
 *
 * Google rotates `__Secure-1PSIDTS` within seconds of a Gmail page loading, and
 * signs out a cookie store that has fallen several rotations behind. Every run
 * launches on a copy and throws the copy away, so without this the profile
 * somebody signed in by hand would fall one rotation behind per run until
 * Google stopped accepting it. A run that stayed signed in therefore writes its
 * rotated cookie store back over the profile's.
 */
import { constants } from "node:fs";
import {
  copyFile,
  link,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ElectronApplication } from "playwright";
import { readProcessStartedAt } from "./process-tree";

const LOCK_NAME = ".e2e-run.lock";

const BREAK_NAME = `${LOCK_NAME}.break`;

const TEMP_SUFFIX = ".e2e-write-back.tmp";

export const LOCK_TIMING = {
  // Under the two minutes a test gets, so a run left waiting fails naming the
  // holder rather than as a bare hook timeout.
  timeout: 90_000,
  // Each check of the holder lists the machine's processes.
  retryInterval: 500,
  // Breaking a lock takes milliseconds.
  staleBreakAge: 10_000,
};

export type LockTiming = typeof LOCK_TIMING;

/** What `cp` leaves out when it copies the profile: none of it is session state. */
export function isWriteBackArtifact(source: string) {
  const name = path.basename(source);

  return name.startsWith(LOCK_NAME) || name.endsWith(TEMP_SUFFIX);
}

/**
 * Whether the app is signed in to Gmail right now, with its cookie stores
 * flushed to disk so that a quit straight after loses none of them.
 *
 * Signed in means an account view is on Gmail and the page's own request for
 * its inbox feed comes back 200 without a redirect, which a signed-out session
 * answers with 401. The page's request rather than one from the main process,
 * because it is the page's cookies that rotate.
 */
export function flushAndCheckSignedIn(app: ElectronApplication) {
  return app.evaluate(async ({ webContents }) => {
    const all = webContents.getAllWebContents().filter((contents) => !contents.isDestroyed());

    await Promise.all(
      [...new Set(all.map((contents) => contents.session))].map((session) =>
        session.cookies.flushStore(),
      ),
    );

    const gmail = all.find((contents) =>
      /^https:\/\/mail\.google\.com\/mail\/u\/\d+\//.test(contents.getURL()),
    );

    if (!gmail) {
      return false;
    }

    return (await gmail.executeJavaScript(
      `fetch(location.pathname.match(/^\\/mail\\/u\\/\\d+\\//)[0] + "feed/atom").then((response) => response.status === 200 && !response.redirected)`,
    )) as boolean;
  });
}

/**
 * When the store's `__Secure-1PSIDTS` for google.com was last set, in
 * Chromium's microseconds since 1601, or 0 when it holds none. Only the
 * timestamp is read, never the value.
 */
function readRotatedAt(cookiesPath: string) {
  const database = new DatabaseSync(cookiesPath, { readOnly: true });

  try {
    const statement = database.prepare(
      "SELECT MAX(last_update_utc) AS rotatedAt FROM cookies WHERE name = '__Secure-1PSIDTS' AND host_key = '.google.com'",
    );

    // The timestamps are wider than a double holds exactly.
    statement.setReadBigInts(true);

    const row = statement.get() as { rotatedAt: bigint | null } | undefined;

    return row?.rotatedAt ?? 0n;
  } finally {
    database.close();
  }
}

/** SQLite leaves a non-empty journal beside a store it did not close cleanly. */
async function hasHotJournal(cookiesPath: string) {
  const journal = await stat(`${cookiesPath}-journal`).catch(() => undefined);

  return Boolean(journal && journal.size > 0);
}

/*
 * So that a crash straight after the rename finds the new store on disk rather
 * than an empty or half-written file under the old store's name.
 */
async function syncPath(filePath: string) {
  const handle = await open(filePath, "r");

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

type LockState = { holder: string; ino: number; birthtimeMs: number };

async function readLock(lockPath: string): Promise<LockState | undefined> {
  const [holder, lockStat] = await Promise.all([
    readFile(lockPath, "utf8").catch(() => undefined),
    stat(lockPath).catch(() => undefined),
  ]);

  if (holder === undefined || !lockStat) {
    return undefined;
  }

  return { holder, ino: lockStat.ino, birthtimeMs: lockStat.birthtimeMs };
}

function isSameLock(a: LockState, b: LockState) {
  return a.ino === b.ino && a.birthtimeMs === b.birthtimeMs && a.holder === b.holder;
}

/*
 * A pid with its start time, so that a pid the system has since handed to
 * another process does not keep the lock held.
 */
async function describeHolder(pid: number) {
  const startedAt = await readProcessStartedAt(pid).catch(() => undefined);

  return startedAt === undefined ? String(pid) : `${pid} ${startedAt}`;
}

/*
 * Stale only once the process that took it is gone. A holder that is alive
 * but halted, at a breakpoint, stopped or asleep, still holds it, and a
 * waiter times out naming it rather than starting beside it.
 */
async function isStale(lock: LockState) {
  const [pidText, startedAtText] = lock.holder.split(" ");

  const pid = Number(pidText);

  if (!Number.isInteger(pid) || pid <= 0) {
    return true;
  }

  if (!isRunning(pid)) {
    return true;
  }

  if (startedAtText === undefined) {
    return false;
  }

  const startedAt = await readProcessStartedAt(pid).catch(() => undefined);

  return startedAt !== undefined && String(startedAt) !== startedAtText;
}

/*
 * The holder is written before the lock appears, through a hard link that
 * fails when the lock exists, so no waiter ever reads a lock without one.
 */
async function createLock(lockPath: string, holder: string) {
  const temporary = `${lockPath}.${process.pid}.${Date.now()}.tmp`;

  await writeFile(temporary, holder, { mode: 0o600 });

  try {
    await link(temporary, lockPath);

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }

    throw error;
  } finally {
    await rm(temporary, { force: true });
  }
}

/*
 * Deletes the lock only if it is still the one judged stale. Waiters that all
 * judged the same lock stale would otherwise each delete it, and a slower one
 * would delete the lock a faster one had taken in the meantime. The break file
 * lets one waiter at a time compare and delete, and nothing else deletes a
 * lock whose holder is gone, so the comparison still holds at the delete.
 */
async function breakLock(profileDir: string, judged: LockState, timing: LockTiming) {
  const lockPath = path.join(profileDir, LOCK_NAME);

  const breakPath = path.join(profileDir, BREAK_NAME);

  let handle;

  try {
    handle = await open(
      breakPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
      throw error;
    }

    const breakStat = await stat(breakPath).catch(() => undefined);

    if (breakStat && Date.now() - breakStat.mtimeMs > timing.staleBreakAge) {
      await rm(breakPath, { force: true });
    }

    return;
  }

  await handle.close();

  try {
    const current = await readLock(lockPath);

    if (current && isSameLock(current, judged)) {
      await rm(lockPath, { force: true });
    }
  } finally {
    await rm(breakPath, { force: true });
  }
}

/** A write-back that crashed leaves its temporary file beside the store. */
async function removeLeftoverTemporaries(profileDir: string) {
  const partitionsDir = path.join(profileDir, "Partitions");

  for (const partition of await readdir(partitionsDir).catch(() => [])) {
    const partitionDir = path.join(partitionsDir, partition);

    for (const entry of await readdir(partitionDir).catch(() => [])) {
      if (entry.endsWith(TEMP_SUFFIX)) {
        await rm(path.join(partitionDir, entry), { force: true });
      }
    }
  }
}

/**
 * Held from copying the profile until its session is written back, so that no
 * two runs, from any worktree, have live copies of it at once: two clients
 * rotating one session get both signed out. Taken in the profile itself, and
 * broken only once the process that took it is gone.
 */
export async function acquireProfileLock(profileDir: string, timing: LockTiming = LOCK_TIMING) {
  const lockPath = path.join(profileDir, LOCK_NAME);

  const holder = await describeHolder(process.pid);

  const giveUpAt = Date.now() + timing.timeout;

  for (;;) {
    if (await createLock(lockPath, holder)) {
      const ours = await readLock(lockPath);

      await removeLeftoverTemporaries(profileDir);

      return async () => {
        const current = await readLock(lockPath);

        if (ours && current && isSameLock(current, ours)) {
          await rm(lockPath, { force: true });
        }
      };
    }

    const lock = await readLock(lockPath);

    if (lock && (await isStale(lock))) {
      await breakLock(profileDir, lock, timing);

      continue;
    }

    if (Date.now() > giveUpAt) {
      throw new Error(
        `Another run on the signed-in profile, pid ${lock?.holder.split(" ")[0] ?? "unknown"}, has held ${lockPath} for over ${timing.timeout}ms. Two apps on one Google session sign each other out, so this run waits for that one rather than starting beside it.`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, timing.retryInterval));
  }
}

/**
 * Writes each account partition's cookie store from a run's copy back over the
 * profile's, and reports what it did.
 *
 * Only a store whose rotating cookie is newer than the profile's goes back, so
 * a run that never rotated changes nothing. Each store goes through a temporary
 * file renamed into place, so an interrupted write-back leaves the old store
 * whole.
 *
 * Call it only while holding `acquireProfileLock`, and only for a copy that was
 * signed in at quit and whose app exited cleanly, since nothing in the store
 * itself says it was signed out.
 */
export async function writeBackSession(profileDir: string, copyDir: string) {
  const partitions = await readdir(path.join(copyDir, "Partitions")).catch(() => []);

  const written: string[] = [];

  const skipped: string[] = [];

  for (const partition of partitions) {
    const copyCookies = path.join(copyDir, "Partitions", partition, "Cookies");

    const profileCookies = path.join(profileDir, "Partitions", partition, "Cookies");

    if (!(await stat(copyCookies).catch(() => undefined))) {
      continue;
    }

    if (!(await stat(path.dirname(profileCookies)).catch(() => undefined))) {
      skipped.push(`${partition}: not a partition of the profile`);

      continue;
    }

    if ((await hasHotJournal(copyCookies)) || (await hasHotJournal(profileCookies))) {
      skipped.push(`${partition}: a cookie store was not closed cleanly`);

      continue;
    }

    const copyRotatedAt = readRotatedAt(copyCookies);

    if (copyRotatedAt === 0n) {
      skipped.push(`${partition}: the run's store holds no session`);

      continue;
    }

    const profileRotatedAt = (await stat(profileCookies).catch(() => undefined))
      ? readRotatedAt(profileCookies)
      : 0n;

    if (copyRotatedAt <= profileRotatedAt) {
      skipped.push(`${partition}: the session did not rotate past the profile's`);

      continue;
    }

    const temporary = `${profileCookies}.${process.pid}${TEMP_SUFFIX}`;

    try {
      await copyFile(copyCookies, temporary);

      await syncPath(temporary);

      await rename(temporary, profileCookies);

      // Windows refuses to sync a directory, with EPERM, after the rename has
      // already landed.
      if (process.platform !== "win32") {
        await syncPath(path.dirname(profileCookies));
      }
    } finally {
      await rm(temporary, { force: true });
    }

    written.push(partition);
  }

  return { written, skipped };
}
