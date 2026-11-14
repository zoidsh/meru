import { gmailPushes } from "../../../shared/channels/gmail.ts";
import type { GmailFeature } from "../feature.ts";

/** Takes the page where main says, which Gmail reaches through its address's fragment alone. */
export const navigate: GmailFeature = {
  apply: ({ bridge, location, settings, undo }) => {
    undo(
      bridge.on(gmailPushes.navigate, ({ hash }) => {
        if (location.href().startsWith(settings.mailbox)) {
          location.setHash(hash);
        }
      })
    );
  },
  id: "navigate",
};
