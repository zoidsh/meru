import { delay } from "es-toolkit";

export const POLL_MS = 100;

/** Calls `check` until it returns a value, or fails once `timeoutMs` passes. */
export const pollUntil = async <T>(
  check: () => Promise<T | undefined>,
  what: string,
  timeoutMs = 90_000
): Promise<T> => {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    // oxlint-disable-next-line no-await-in-loop -- polled in turn
    const value = await check();

    if (value !== undefined) {
      return value;
    }

    // oxlint-disable-next-line no-await-in-loop -- polled in turn
    await delay(POLL_MS);
  }

  throw new Error(`${what} did not happen within ${timeoutMs} ms.`);
};
