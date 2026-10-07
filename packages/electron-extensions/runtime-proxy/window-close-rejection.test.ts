import { describe, expect, test } from "bun:test";
import type { RuntimeProxySendMessageResult } from "./bridge-protocol";
import {
  type WindowCloseFallbackRejection,
  WindowCloseFallbackRejections,
} from "./window-close-rejection";

const OPTED_IN_ID = "nngceckbapebfimnlniiiahkandclblb";

const OTHER_ID = "aeblfdkhhhdcdjpifhhbdiojplfjncoa";

const REJECTION: WindowCloseFallbackRejection = {
  commands: ["fido2RegisterCredentialRequest", "fido2GetCredentialRequest"],
  fallbackMarker: "fallbackRequested",
  error: { name: "NotAllowedError", message: "Not allowed." },
};

const REGISTER = { command: "fido2RegisterCredentialRequest", requestId: "1", data: {} };

const FALLBACK: RuntimeProxySendMessageResult = {
  status: "replied",
  reply: { error: { fallbackRequested: true, message: "FallbackRequested" } },
};

const REJECTED: RuntimeProxySendMessageResult = {
  status: "replied",
  reply: { error: { name: "NotAllowedError", message: "Not allowed." } },
};

function createRejections() {
  return new WindowCloseFallbackRejections((extensionId) =>
    extensionId === OPTED_IN_ID ? REJECTION : undefined,
  );
}

describe("WindowCloseFallbackRejections", () => {
  test("rejects a fallback asked for after the user closed a window opened for the request", () => {
    const rejections = createRejections();

    const request = rejections.track(OPTED_IN_ID, REGISTER);

    rejections.windowOpened(OPTED_IN_ID, 2);

    rejections.windowClosedByUser(OPTED_IN_ID, 2);

    expect(request).toBeDefined();

    expect(rejections.settle(request as object, FALLBACK)).toEqual(REJECTED);
  });

  test("passes a fallback through when no window closed", () => {
    const rejections = createRejections();

    const request = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.windowOpened(OPTED_IN_ID, 2);

    expect(rejections.settle(request, FALLBACK)).toBe(FALLBACK);
  });

  test("passes a fallback through when the window closed other than by the user", () => {
    const rejections = createRejections();

    const request = rejections.track(OPTED_IN_ID, REGISTER) as object;

    // The popout the extension closed itself after the user picked another
    // device, which is reported as opened and never as closed by the user
    rejections.windowOpened(OPTED_IN_ID, 2);

    expect(rejections.settle(request, FALLBACK)).toBe(FALLBACK);
  });

  test("passes a fallback through when the window closed was open before the request", () => {
    const rejections = createRejections();

    rejections.windowOpened(OPTED_IN_ID, 2);

    const request = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.windowClosedByUser(OPTED_IN_ID, 2);

    expect(rejections.settle(request, FALLBACK)).toBe(FALLBACK);
  });

  test("passes a fallback through when the window closed belongs to another extension", () => {
    const rejections = createRejections();

    const request = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.windowOpened(OTHER_ID, 2);

    rejections.windowClosedByUser(OTHER_ID, 2);

    expect(rejections.settle(request, FALLBACK)).toBe(FALLBACK);
  });

  test("passes a success through when the user closed the window", () => {
    const rejections = createRejections();

    const request = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.windowOpened(OPTED_IN_ID, 2);

    rejections.windowClosedByUser(OPTED_IN_ID, 2);

    const success: RuntimeProxySendMessageResult = {
      status: "replied",
      reply: { credentialId: "abc" },
    };

    expect(rejections.settle(request, success)).toBe(success);

    const otherError: RuntimeProxySendMessageResult = {
      status: "replied",
      reply: { error: { name: "NotAllowedError", message: "Policy" } },
    };

    expect(rejections.settle(request, otherError)).toBe(otherError);

    const closed: RuntimeProxySendMessageResult = { status: "closed" };

    expect(rejections.settle(request, closed)).toBe(closed);
  });

  test("needs the marker to be true, not merely present", () => {
    const rejections = createRejections();

    const request = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.windowOpened(OPTED_IN_ID, 2);

    rejections.windowClosedByUser(OPTED_IN_ID, 2);

    const notFallback: RuntimeProxySendMessageResult = {
      status: "replied",
      reply: { error: { fallbackRequested: false, message: "Other" } },
    };

    expect(rejections.settle(request, notFallback)).toBe(notFallback);
  });

  test("tracks nothing for a command the rule doesn't name", () => {
    const rejections = createRejections();

    expect(rejections.track(OPTED_IN_ID, { command: "fido2AbortRequest" })).toBeUndefined();

    expect(rejections.track(OPTED_IN_ID, "fido2RegisterCredentialRequest")).toBeUndefined();

    expect(rejections.track(OPTED_IN_ID, null)).toBeUndefined();
  });

  test("tracks nothing for an extension that isn't opted in", () => {
    const rejections = createRejections();

    expect(rejections.track(OTHER_ID, REGISTER)).toBeUndefined();
  });

  test("forgets a request once it is settled", () => {
    const rejections = createRejections();

    const first = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.settle(first, FALLBACK);

    const second = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.windowOpened(OPTED_IN_ID, 2);

    rejections.windowClosedByUser(OPTED_IN_ID, 2);

    // Settling the first again finds nothing marked on it
    expect(rejections.settle(first, FALLBACK)).toBe(FALLBACK);

    expect(rejections.settle(second, FALLBACK)).toEqual(REJECTED);
  });

  test("keeps the rest of the reply", () => {
    const rejections = createRejections();

    const request = rejections.track(OPTED_IN_ID, REGISTER) as object;

    rejections.windowOpened(OPTED_IN_ID, 2);

    rejections.windowClosedByUser(OPTED_IN_ID, 2);

    expect(
      rejections.settle(request, {
        status: "replied",
        reply: { requestId: "1", error: { fallbackRequested: true, message: "FallbackRequested" } },
      }),
    ).toEqual({
      status: "replied",
      reply: { requestId: "1", error: { name: "NotAllowedError", message: "Not allowed." } },
    });
  });
});
