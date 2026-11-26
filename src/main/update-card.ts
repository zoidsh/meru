import { isEqual } from "es-toolkit";

import {
  UPDATE_CARD_OFFERS,
  updateCard,
  updateCardKey,
} from "#core/updates.ts";
import type { UpdateCardAction } from "#core/updates.ts";

import type { Overlays } from "./overlay.ts";
import type { Updates } from "./updates.ts";

/**
 * The main window's update card: shown while nothing else holds the
 * overlay's view, giving way to anything that opens and coming back once the
 * view is free, until Later or Close puts its version aside for the run.
 */
export const createUpdateCard = ({
  updates,
  overlays,
  log,
}: {
  updates: Pick<Updates, "read" | "restart" | "openRelease" | "openWhatsNew">;
  overlays: Pick<Overlays, "current" | "open" | "close">;
  log: (message: string) => void;
}) => {
  const dismissed = new Set<string>();

  const follow = () => {
    const card = updateCard(updates.read(), dismissed);
    const open = overlays.current();

    if (open?.kind === "update") {
      if (!card) {
        overlays.close();
      } else if (!isEqual(open, { kind: "update", ...card })) {
        overlays.open({ kind: "update", ...card }, { takeFocus: false });
      }

      return;
    }

    if (card && open === undefined) {
      overlays.open({ kind: "update", ...card }, { takeFocus: false });
    }
  };

  return {
    follow,
    /** Whether the card is what the overlay's view shows. */
    isOpen: () => overlays.current()?.kind === "update",
    /** One of the open card's buttons, or Escape in it, which is Later or Close. */
    run: (action: UpdateCardAction) => {
      const open = overlays.current();

      if (open?.kind !== "update") {
        log(`Refused the update card's ${action} with no card open`);

        return;
      }

      if (!UPDATE_CARD_OFFERS[open.card].includes(action)) {
        log(`Refused the update card's ${action} on a ${open.card} card`);

        return;
      }

      switch (action) {
        case "restart": {
          updates.restart();
          break;
        }
        case "whats-new": {
          updates.openWhatsNew(open.version);
          break;
        }
        case "download": {
          updates.openRelease();
          break;
        }
        default: {
          dismissed.add(updateCardKey(open));
          follow();
        }
      }
    },
  };
};

export type UpdateCardModule = ReturnType<typeof createUpdateCard>;
