import type { ChromeNamespace } from "../facade/lib/chrome";
import { getLastErrorMessage } from "../facade/lib/last-error";
import type { RuntimeProxyStorageResult } from "./storage-protocol";

export type NativeMethod = (...callArguments: unknown[]) => unknown;

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isThenable(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/**
 * Calls one native `chrome.storage` method and reports how it ended, in
 * whichever of Chrome's two forms the runtime answers in.
 *
 * A trailing callback is passed, which every version of the API accepts and
 * which is where `lastError` is readable — the extension's own error text for
 * a quota overrun, a write to `managed`, a malformed key. A runtime that
 * answers with a promise instead, ignoring the callback, is handled too, and a
 * throw on the way in is an error like any other.
 */
export function invokeNativeMethod(
  runtime: ChromeNamespace | undefined,
  target: ChromeNamespace,
  method: (...callArguments: unknown[]) => unknown,
  callArguments: unknown[],
): Promise<RuntimeProxyStorageResult> {
  return new Promise((resolve) => {
    let isSettled = false;

    const settle = (result: RuntimeProxyStorageResult) => {
      if (isSettled) {
        return;
      }

      isSettled = true;

      resolve(result);
    };

    try {
      const returned = method.apply(target, [
        ...callArguments,
        (value?: unknown) => {
          const lastError = runtime ? getLastErrorMessage(runtime) : undefined;

          settle(
            lastError === undefined
              ? { status: "ok", value }
              : { status: "error", message: lastError },
          );
        },
      ]);

      if (isThenable(returned)) {
        returned.then(
          (value) => {
            settle({ status: "ok", value });
          },
          (error: unknown) => {
            settle({ status: "error", message: getErrorMessage(error) });
          },
        );
      }
    } catch (error) {
      settle({ status: "error", message: getErrorMessage(error) });
    }
  });
}
