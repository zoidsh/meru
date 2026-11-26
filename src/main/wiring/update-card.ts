import type { Overlays } from "../overlay.ts";
import { createUpdateCard } from "../update-card.ts";
import type { Updates } from "../updates.ts";

/** The main window's update card, following where updating stands and the overlay's view. */
export const wireUpdateCard = ({
  updates,
  overlays,
  log,
}: {
  updates: Updates;
  overlays: Overlays;
  log: (message: string) => void;
}) => {
  const card = createUpdateCard({ updates, overlays, log });

  updates.onChange(card.follow);
  overlays.onChange(card.follow);
  card.follow();

  return card;
};
