import { session as sessions } from "electron";
import type { OnBeforeRequestListenerDetails, Session } from "electron";

import type { BlockAsk } from "#core/blocker.ts";

type Refuses = (details: OnBeforeRequestListenerDetails) => boolean;

interface Filters {
  /** Asked first, so what it stops is never seen by the guard. */
  block?: Refuses | undefined;
  /** The last word, for the suite's build alone. */
  guard?: Refuses;
}

// Electron keeps only the last `onBeforeRequest` listener of a session, so
// one listener asks every filter, and goes when none is left.
const filtersOf = new WeakMap<Session, Filters>();

const listen = (session: Session, filters: Filters) => {
  const listening = filtersOf.has(session);
  const filtering = Boolean(filters.block ?? filters.guard);

  if (filtering) {
    filtersOf.set(session, filters);
  } else {
    filtersOf.delete(session);
  }

  if (filtering === listening) {
    return;
  }

  if (!filtering) {
    session.webRequest.onBeforeRequest(null);

    return;
  }

  session.webRequest.onBeforeRequest((details, respond) => {
    const current = filtersOf.get(session);

    respond({
      cancel:
        current?.block?.(details) === true ||
        current?.guard?.(details) === true,
    });
  });
};

/** Refuses each request of the session that `guard` names, whatever else filters it. */
export const guardRequests = (session: Session, guard: Refuses) => {
  listen(session, { ...filtersOf.get(session), guard });
};

export interface RequestBlocker {
  /**
   * Cancels each request in the partition's session that `blocks` names,
   * from its next request on; `undefined` stops, and with nothing else
   * filtering the session its requests go unasked.
   */
  block: (
    partition: string,
    blocks: ((ask: BlockAsk) => boolean) | undefined
  ) => void;
}

export const createRequestBlocker = (): RequestBlocker => ({
  block: (partition, blocks) => {
    const session = sessions.fromPartition(partition);
    listen(session, { ...filtersOf.get(session), block: blocks });
  },
});
