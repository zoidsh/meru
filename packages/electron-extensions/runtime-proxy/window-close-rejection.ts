import type { RuntimeProxySendMessageResult } from "./bridge-protocol";

/**
 * How one extension's reply is rewritten when the user closed a window it
 * opened for the request being answered. The extension's own message and reply
 * shapes, given as data so that the relay knows none of them.
 */
export type WindowCloseFallbackRejection = {
  /** The `command` of each message whose reply may be rewritten. */
  commands: string[];
  /** The property set to `true` on a reply's `error` when it asks for the browser's fallback. */
  fallbackMarker: string;
  /** What the reply's `error` becomes. */
  error: { name: string; message: string };
};

export type GetWindowCloseFallbackRejection = (
  extensionId: string,
) => WindowCloseFallbackRejection | undefined;

type PendingRequest = {
  extensionId: string;
  rejection: WindowCloseFallbackRejection;
  /** Windows the extension opened while this request was waiting for its reply. */
  openedWindowIds: Set<number>;
  wasWindowClosedByUser: boolean;
};

export type PendingRequestHandle = object;

/**
 * Turns a password manager's request for the browser's own passkey fallback
 * into the rejection Chrome gives a dismissed dialog, when what led to it was
 * the user closing the extension's popout.
 *
 * Electron's native WebAuthn shows nothing and answers only after 180 seconds,
 * whatever timeout the page asked for, and nothing in its API ends a pending
 * request early. So a fallback asked for because the user closed the popout
 * leaves the page waiting three minutes for a dialog that never appears.
 *
 * The reply alone can't say why the fallback was asked for: an extension asks
 * for it the same way when its passkeys are off, when the site is excluded,
 * when only a security key will do and when the user asks in the popout for
 * their device or security key, and native is the route that works for each of
 * those. So a reply is rewritten only for a request that saw a window open and
 * then saw the user close that window before the reply came. A window the
 * extension closes through `windows.remove` doesn't count, which is how
 * Bitwarden's popout goes away after the user asks for their device. A page
 * closing its own window with `window.close()` does count, since nothing tells
 * that apart from the user closing it.
 */
export class WindowCloseFallbackRejections {
  private getRejection: GetWindowCloseFallbackRejection;

  private pendingRequests = new Set<PendingRequest>();

  constructor(getRejection: GetWindowCloseFallbackRejection) {
    this.getRejection = getRejection;
  }

  /** Starts watching a message's request, if its extension's rewrite covers the command. */
  track(extensionId: string, message: unknown): PendingRequestHandle | undefined {
    const rejection = this.getRejection(extensionId);

    if (!rejection) {
      return undefined;
    }

    const command = (message as { command?: unknown } | null | undefined)?.command;

    if (typeof command !== "string" || !rejection.commands.includes(command)) {
      return undefined;
    }

    const request: PendingRequest = {
      extensionId,
      rejection,
      openedWindowIds: new Set(),
      wasWindowClosedByUser: false,
    };

    this.pendingRequests.add(request);

    return request;
  }

  windowOpened(extensionId: string, windowId: number) {
    for (const request of this.pendingRequests) {
      if (request.extensionId === extensionId) {
        request.openedWindowIds.add(windowId);
      }
    }
  }

  windowClosedByUser(extensionId: string, windowId: number) {
    for (const request of this.pendingRequests) {
      if (request.extensionId === extensionId && request.openedWindowIds.has(windowId)) {
        request.wasWindowClosedByUser = true;
      }
    }
  }

  /** Stops watching the request, and answers with its reply as the page should hear it. */
  settle(
    handle: PendingRequestHandle,
    result: RuntimeProxySendMessageResult,
  ): RuntimeProxySendMessageResult {
    const request = handle as PendingRequest;

    this.pendingRequests.delete(request);

    if (
      !request.wasWindowClosedByUser ||
      result.status !== "replied" ||
      !isFallbackReply(result.reply, request.rejection.fallbackMarker)
    ) {
      return result;
    }

    return {
      status: "replied",
      reply: {
        ...(result.reply as Record<string, unknown>),
        error: { ...request.rejection.error },
      },
    };
  }
}

function isFallbackReply(reply: unknown, fallbackMarker: string) {
  const error = (reply as { error?: unknown } | null | undefined)?.error;

  return (
    typeof error === "object" &&
    error !== null &&
    (error as Record<string, unknown>)[fallbackMarker] === true
  );
}
