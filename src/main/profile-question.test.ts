import { beforeEach, describe, expect, it } from "vitest";

import type { Overlay } from "#core/overlay.ts";

import { createProfileQuestion } from "./profile-question.ts";

/** The overlays as main's own keep them: one open, each change told. */
const fakeOverlays = (initial?: Overlay) => {
  let open = initial;
  const listeners = new Set<() => void>();
  const set = (next: Overlay | undefined) => {
    open = next;

    for (const listener of listeners) {
      listener();
    }
  };

  return {
    open: (overlay: Overlay) => {
      set(overlay);
    },
    close: () => {
      set(undefined);
    },
    current: () => open,
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

/** The main window's hide, which a test tells. */
const windowHides = new Set<() => void>();
const onWindowHide = (listener: () => void) => {
  windowHides.add(listener);
};
const hideWindow = () => {
  for (const listener of windowHides) {
    listener();
  }
};

const IDS = ["a", "c", "d"];

describe(createProfileQuestion, () => {
  beforeEach(() => {
    windowHides.clear();
  });

  it("answers none and closes when the main window hides, so the next link asks again in a window shown for it", async () => {
    const overlays = fakeOverlays();
    const question = createProfileQuestion({ overlays, onWindowHide });
    const first = question.ask(IDS);

    hideWindow();

    await expect(first).resolves.toBeUndefined();
    expect(overlays.current()).toBeUndefined();

    const second = question.ask(IDS);

    expect(overlays.current()).toStrictEqual({
      kind: "profile-question",
      profileIds: IDS,
    });
    question.answer("d");

    await expect(second).resolves.toBe("d");
  });

  it("leaves any other card open when the main window hides", () => {
    const license: Overlay = { kind: "license" };
    const overlays = fakeOverlays(license);

    createProfileQuestion({ overlays, onWindowHide });
    hideWindow();

    expect(overlays.current()).toStrictEqual(license);
  });

  it("opens the question over the main window and answers with the profile picked, closing it", async () => {
    const overlays = fakeOverlays();
    const question = createProfileQuestion({ overlays, onWindowHide });
    const answered = question.ask(IDS);

    expect(overlays.current()).toStrictEqual({
      kind: "profile-question",
      profileIds: IDS,
    });
    question.answer("c");

    await expect(answered).resolves.toBe("c");
    expect(overlays.current()).toBeUndefined();
  });

  it("answers none when it closes without a pick, as Cancel, Escape and a press outside close it", async () => {
    const overlays = fakeOverlays();
    const question = createProfileQuestion({ overlays, onWindowHide });
    const answered = question.ask(IDS);

    overlays.close();

    await expect(answered).resolves.toBeUndefined();
  });

  it("answers none when anything else opens in its place", async () => {
    const overlays = fakeOverlays();
    const question = createProfileQuestion({ overlays, onWindowHide });
    const answered = question.ask(IDS);

    overlays.open({ kind: "downloads" });

    await expect(answered).resolves.toBeUndefined();
  });

  it("takes no profile it did not offer, and no answer once it is answered", async () => {
    const overlays = fakeOverlays();
    const question = createProfileQuestion({ overlays, onWindowHide });
    const answered = question.ask(IDS);

    question.answer("b");

    expect(overlays.current()?.kind).toBe("profile-question");

    question.answer("a");
    question.answer("d");

    await expect(answered).resolves.toBe("a");
  });

  it("waits behind the license notice and the screen picker, opening once each closes", async () => {
    for (const shown of [
      { kind: "license" },
      { kind: "screen-picker", profileId: "a", tabId: "meet" },
    ] as const) {
      const overlays = fakeOverlays(shown);
      const question = createProfileQuestion({ overlays, onWindowHide });
      const answered = question.ask(IDS);

      expect(overlays.current()).toStrictEqual(shown);

      overlays.close();

      expect(overlays.current()?.kind).toBe("profile-question");

      question.answer("d");

      // oxlint-disable-next-line no-await-in-loop -- one card after another
      await expect(answered).resolves.toBe("d");
    }
  });

  it("replaces a toast, the update card or New tab rather than waiting", () => {
    const overlays = fakeOverlays({ kind: "toast", message: "no-room" });
    const question = createProfileQuestion({ overlays, onWindowHide });

    void question.ask(IDS);

    expect(overlays.current()?.kind).toBe("profile-question");
  });
});
