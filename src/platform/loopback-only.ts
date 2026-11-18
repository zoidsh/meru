import { app } from "electron";
import type { Session } from "electron";

import { REFUSED_MARKER, staysOnMachine } from "#core/loopback.ts";

const guard = (session: Session) => {
  session.webRequest.onBeforeRequest((details, respond) => {
    if (staysOnMachine(details.url)) {
      respond({});

      return;
    }

    console.error(`${REFUSED_MARKER} ${details.url}`);
    respond({ cancel: true });
  });
};

/**
 * Refuses every request that would leave this machine, in every session as
 * it is made, saying each on stderr; for the suite's build alone, whose
 * stand-ins all listen on loopback. Set before the app is ready, so the
 * default session is among them.
 */
export const keepToLoopback = () => {
  app.on("session-created", guard);
};
