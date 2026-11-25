/** What a filter is asked of each request. */
export interface FilteredRequest {
  url: string;
  resourceType: string;
}

type Listener = (
  details: FilteredRequest,
  respond: (response: { cancel: boolean }) => void
) => void;

/** The part of a session's `webRequest` the filters use. */
export interface FilteredSession {
  webRequest: { onBeforeRequest: (listener: Listener | null) => void };
}

type Refuses = (request: FilteredRequest) => boolean;

interface Filters {
  /** Asked first, so what it stops is never seen by the guard. */
  block?: Refuses | undefined;
  /** The last word, for the suite's build alone. */
  guard?: Refuses | undefined;
}

/**
 * The filters on each session's requests. Electron keeps only the last
 * `onBeforeRequest` listener of a session, so one listener asks every
 * filter, set when the first one is and taken off when none is left, so
 * no request then waits on main.
 */
export const createRequestFilters = <Session extends FilteredSession>() => {
  const filtersOf = new WeakMap<Session, Filters>();

  const set = (session: Session, change: Filters) => {
    const listening = filtersOf.has(session);
    const filters = { ...filtersOf.get(session), ...change };
    const filtering = Boolean(filters.block ?? filters.guard);

    if (filtering) {
      filtersOf.set(session, filters);
    } else {
      filtersOf.delete(session);
    }

    if (filtering === listening) {
      return;
    }

    session.webRequest.onBeforeRequest(
      filtering
        ? (details, respond) => {
            const current = filtersOf.get(session);

            respond({
              cancel:
                current?.block?.(details) === true ||
                current?.guard?.(details) === true,
            });
          }
        : null
    );
  };

  return {
    /** Refuses each request the guard names, whatever else filters it. */
    guard: (session: Session, guard: Refuses) => {
      set(session, { guard });
    },
    /** Cancels each request `blocks` names; `undefined` stops. */
    block: (session: Session, blocks: Refuses | undefined) => {
      set(session, { block: blocks });
    },
  };
};
