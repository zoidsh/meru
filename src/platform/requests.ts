import { session as sessions } from "electron";
import type { Session } from "electron";

import type { BlockAsk } from "#core/blocker.ts";

import { createRequestFilters } from "./request-filters.ts";

const filters = createRequestFilters<Session>();

/** Refuses each request of the session that `guard` names, whatever else filters it. */
export const guardRequests = (
  session: Session,
  guard: (ask: BlockAsk) => boolean
) => {
  filters.guard(session, guard);
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
    filters.block(sessions.fromPartition(partition), blocks);
  },
});
