import type { Result } from "../core/result.ts";

/** The result's value, throwing its error so a test fails where an expected success did not come. */
export const unwrap = <T>(result: Result<T, unknown>): T => {
  if (!result.ok) {
    throw new Error(`Expected success, got ${String(result.error)}`);
  }
  return result.value;
};
