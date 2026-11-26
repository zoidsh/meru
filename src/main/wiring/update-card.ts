import type { Overlays } from "../overlay.ts";
import { createUpdateCard } from "../update-card.ts";
import type { Updates } from "../updates.ts";

/** The main window's update card, following where updating stands and the overlay's view. */
export const wireUpdateCard = ({
  updates,
  overlays,
}: {
  updates: Updates;
  overlays: Overlays;
}) => {
  const card = createUpdateCard({ updates, overlays, log: console.error });

  updates.onChange(card.follow);
  overlays.onChange(card.follow);
  card.follow();

  return card;
};
