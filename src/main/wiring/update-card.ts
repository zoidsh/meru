import { releaseTag } from "#core/releases.ts";

import type { Overlays } from "../overlay.ts";
import type { SettingsPages } from "../settings-pages.ts";
import { createUpdateCard } from "../update-card.ts";
import type { Updates } from "../updates.ts";

/** The main window's update card, following where updating stands and the overlay's view. */
export const wireUpdateCard = ({
  updates,
  overlays,
  openSettings,
  settingsPages,
  log,
}: {
  updates: Updates;
  overlays: Overlays;
  openSettings: () => void;
  settingsPages: Pick<SettingsPages, "open">;
  log: (message: string) => void;
}) => {
  const card = createUpdateCard({
    updates,
    overlays,
    showWhatsNew: (version) => {
      openSettings();
      settingsPages.open(
        { section: "about", profileId: null },
        releaseTag(version)
      );
    },
    log,
  });

  updates.onChange(card.follow);
  overlays.onChange(card.follow);
  card.follow();

  return card;
};
