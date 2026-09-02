/**
 * How long the next park waits after a stream ended cleanly, shared by the two
 * clients that keep a stream parked at the bridge — the worker's job stream
 * (`relay-client.ts`) and a shimmed context's receive stream
 * (`page-stream-client.ts`).
 *
 * A clean end is main having closed the stream deliberately, which for both is
 * the ordinary case and not a failure: the jobs behind a replaced job stream
 * are already queued, and an evicted page context hears nothing until it parks
 * again. So the first clean end waits for nothing at all. What the immediate
 * re-park opens up is a main that closes every stream as it arrives, which an
 * unconditional re-park would answer with a tight loop, and that is what the
 * doubling bounds — a client that keeps being closed at once ends up parking
 * about as often as a flat wait would have let it.
 *
 * The wait is only ever paid by a stream that ended cleanly. A refused or
 * broken one is its client's own business, and the two differ there: the job
 * stream waits a flat delay, a page stream doubles up to half a minute.
 */

/** What the second clean end inside the window waits, doubling from there. */
const FLOOR_MS = 16;

/** How long a stream has to live for its clean end to count as ordinary. */
export const DEFAULT_CLEAN_END_WINDOW_MS = 1000;

export type CleanEndBackoffOptions = {
  /** Where the doubling stops, which is the wait a flapping main settles at. */
  ceilingMs: number;
  /** How long a stream has to live for the doubling to start over. */
  windowMs?: number;
};

export function createCleanEndBackoff({
  ceilingMs,
  windowMs = DEFAULT_CLEAN_END_WINDOW_MS,
}: CleanEndBackoffOptions) {
  let backoffMs = 0;

  return {
    /**
     * What to wait before parking again, given how long the stream that just
     * ended cleanly had lived. A stream that lived out the window starts the
     * doubling over, so the wait decays to nothing as soon as one does.
     */
    next(livedMs: number) {
      if (livedMs >= windowMs) {
        backoffMs = 0;
      }

      const delayMs = backoffMs;

      backoffMs = Math.min(backoffMs === 0 ? FLOOR_MS : backoffMs * 2, ceilingMs);

      return delayMs;
    },

    /** Forgets the flapping, for a client whose stream failed instead. */
    reset() {
      backoffMs = 0;
    },
  };
}
