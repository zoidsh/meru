import { app } from "electron";
import type { Session } from "electron";

import { REFUSED_MARKER, staysOnMachine } from "#core/loopback.ts";

import { guardRequests } from "./requests.ts";

/**
 * Where no server listens, so no spellchecker dictionary is ever downloaded
 * from Google's servers, as Chromium would the first time a language is
 * checked.
 */
const NO_DICTIONARIES = "http://127.0.0.1:1/";

const guard = (session: Session) => {
  session.setSpellCheckerDictionaryDownloadURL(NO_DICTIONARIES);
  guardRequests(session, ({ url }) => {
    if (staysOnMachine(url)) {
      return false;
    }

    console.error(`${REFUSED_MARKER} ${url}`);

    return true;
  });
};

/**
 * Refuses every request that would leave this machine, in every session as
 * it is made, saying each on stderr, and downloads no dictionary; for the
 * suite's build alone, whose stand-ins all listen on loopback. Set before
 * the app is ready, so the default session is among them.
 */
export const keepToLoopback = () => {
  app.on("session-created", guard);
};
