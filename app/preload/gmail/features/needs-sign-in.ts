import { gmail } from "../../../shared/channels/gmail.ts";
import type { GmailFeature } from "../feature.ts";

/** The pane landing on Google's sign-in is how the page knows its profile's session was signed out, so this one runs wherever the page is. */
export const needsSignIn: GmailFeature = {
  anywhere: true,
  apply: ({ bridge, location, settings, once }) => {
    if (location.href().startsWith(settings.signIn) && once("needsSignIn")) {
      bridge.send(gmail.needsSignIn, {});
    }
  },
  id: "needsSignIn",
};
