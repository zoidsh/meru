import { isExtensionId } from "../derive/extension-id";
import type { ChromeNamespace } from "../facade/lib/chrome";

/**
 * What the two halves of the proxy both need of the API they shadow: a hold on
 * the native method being replaced, and Chrome's own reading of
 * `sendMessage`'s overloads.
 */

export type NativeMethod = (...callArguments: unknown[]) => unknown;

/**
 * The native implementation of a method about to be shadowed, bound to its
 * namespace so it still works once something else stands in its place.
 */
export function getNativeMethod(
  namespace: ChromeNamespace,
  name: string,
): NativeMethod | undefined {
  const method = namespace[name];

  return typeof method === "function" ? (method as NativeMethod).bind(namespace) : undefined;
}

export type ParsedSendMessageArguments = {
  targetExtensionId?: string;
  message: unknown;
};

/**
 * `sendMessage`'s optional leading extension id, told apart the way Chrome
 * tells it: three arguments make the first one the target, and with two the
 * first is a target only when it reads as an extension id. A 32-character
 * lowercase message with an options bag is misread the same way Chrome
 * misreads it.
 */
export function parseSendMessageArguments(callArguments: unknown[]): ParsedSendMessageArguments {
  if (callArguments.length >= 3) {
    return {
      targetExtensionId:
        typeof callArguments[0] === "string" ? (callArguments[0] as string) : undefined,
      message: callArguments[1],
    };
  }

  if (
    callArguments.length === 2 &&
    typeof callArguments[0] === "string" &&
    isExtensionId(callArguments[0])
  ) {
    return { targetExtensionId: callArguments[0], message: callArguments[1] };
  }

  return { message: callArguments[0] };
}
