/*
 * Delivering a link to the app a test is already driving, whether a `meru://`
 * URL or the plain web URL a browser picker hands over.
 *
 * There is no API for this. A deep link reaches Meru the way the desktop hands
 * it over — as the argument list of a process the operating system starts — and
 * on Linux and Windows that means a second copy of the app, which loses the
 * single instance lock, hands its argv to the running one through
 * `second-instance` and quits. Spawning the executable is therefore not a
 * stand-in for the real path; it is the real path, minus the desktop entry that
 * would have chosen the executable. macOS delivers through `open-url` instead,
 * which is why the files calling this skip there.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { EXECUTABLE_PATH, launchArguments, type MeruApp } from "./app";

const execFileAsync = promisify(execFile);

/**
 * Sends a URL to the running app and resolves once the second instance it went
 * through has exited.
 *
 * The exit says the argv was handed over, not that the app has acted on it —
 * the handover is a message between processes and everything after it is
 * asynchronous. Callers poll for the outcome.
 *
 * Losing the lock is the expected outcome and the second instance exits 0 for
 * it, so a non-zero exit is left to reject: it means the executable never got
 * as far as the lock, and a send that silently did nothing would leave every
 * assertion after it reading as the route being broken.
 */
export async function sendDeepLink(meru: MeruApp, url: string) {
  /*
   * The same arguments the harness launched with, because the user data
   * directory among them is what the single instance lock is scoped to: a
   * second instance started without it takes a lock of its own, comes up as a
   * whole second app and never delivers anything.
   *
   * The environment is inherited rather than rebuilt, which is what the harness
   * does for a launch that names none of its own. DISPLAY is in it, and a
   * second instance that cannot reach one never gets as far as the lock.
   */
  await execFileAsync(EXECUTABLE_PATH, [...launchArguments(meru.userDataDir, {}), url], {
    cwd: process.cwd(),
  });
}
