import { serializeError } from "serialize-error";

/**
 * Serializes the `error` in a logger's details, leaving the key out entirely
 * when the caller passed none.
 *
 * `serializeError(undefined)` does not answer `undefined`: it invents a
 * `{ name: "NonError", message: "Non-error value: undefined" }` whose stack
 * points at `serializeError` itself. Every log line from a caller that reports
 * a message without an error — the extension loader's `Extension service worker
 * error`, which forwards a worker's own `console.error` — then carried a stack
 * from inside the logger, which is not where anything went wrong.
 */
export function serializeErrorDetails({
  error,
  ...details
}: Record<string, unknown>): Record<string, unknown> {
  return error === undefined ? details : { ...details, error: serializeError(error) };
}
