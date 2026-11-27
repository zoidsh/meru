import { isEqual } from "es-toolkit";

import type { Log } from "#core/log.ts";
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
  showWhatsNew,
  overlays,
  log,
}: {
  updates: Pick<Updates, "read" | "restart" | "openRelease">;
  /** Shows What's new in Settings at the version's release. */
  showWhatsNew: (version: string) => void;
  overlays: Pick<Overlays, "current" | "open" | "close">;
  log: Log;
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
    /** One of the open card's buttons, or Escape in it, which is Later or Close. */
    run: (action: UpdateCardAction) => {
      const open = overlays.current();

      if (open?.kind !== "update") {
        log("update-card-refused", { action, reason: "no-card" });

        return;
      }

      if (!UPDATE_CARD_OFFERS[open.card].includes(action)) {
        log("update-card-refused", { action, card: open.card });

        return;
      }

      switch (action) {
        case "restart": {
          updates.restart();
          break;
        }
        case "whats-new": {
          showWhatsNew(open.version);
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
