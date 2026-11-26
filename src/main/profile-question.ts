import type { Overlay } from "#core/overlay.ts";

import type { Overlays } from "./overlay.ts";

/**
 * The cards a person is answering, which the question waits behind rather
 * than dismissing: the license notice, read once, and the screen picker,
 * whose page is waiting on it.
 */
const waitsBehind = (overlay: Overlay | undefined) =>
  overlay?.kind === "license" || overlay?.kind === "screen-picker";

/**
 * Which profile writes an email, asked in a card in the main window's
 * overlay, one question at a time. A profile picked answers it; Cancel,
 * Escape, a press outside, the window hidden, or anything else opening in
 * its place answers none, so the next link shows the window and asks again
 * rather than waiting behind a question nobody can see.
 */
export const createProfileQuestion = ({
  overlays,
  onWindowHide,
}: {
  overlays: Pick<Overlays, "open" | "close" | "current" | "onChange">;
  onWindowHide: (listener: () => void) => void;
}) => {
  let asked:
    | { profileIds: readonly string[]; settle: (id?: string) => void }
    | undefined;
  let waiting: (() => void) | undefined;

  overlays.onChange(() => {
    const current = overlays.current();

    if (asked && current?.kind !== "profile-question") {
      const { settle } = asked;

      asked = undefined;
      settle();
    }

    if (waiting && !waitsBehind(current)) {
      const show = waiting;

      waiting = undefined;
      show();
    }
  });

  onWindowHide(() => {
    if (asked && overlays.current()?.kind === "profile-question") {
      overlays.close();
    }
  });

  return {
    /** Asks among `profileIds`, in the order shown; the one picked, if any. */
    ask: (profileIds: readonly string[]) => {
      const { promise, resolve } = Promise.withResolvers<string | undefined>();
      const show = () => {
        asked = { profileIds, settle: resolve };
        overlays.open({
          kind: "profile-question",
          profileIds: [...profileIds],
        });
      };

      if (waitsBehind(overlays.current())) {
        waiting = show;
      } else {
        show();
      }

      return promise;
    },
    /** The person picked `profileId`, if it is one the question offered. */
    answer: (profileId: string) => {
      if (!asked?.profileIds.includes(profileId)) {
        return;
      }

      const { settle } = asked;

      asked = undefined;
      settle(profileId);
      overlays.close();
    },
  };
};

export type ProfileQuestion = ReturnType<typeof createProfileQuestion>;
