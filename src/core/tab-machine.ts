/** Chromium's net error, as `did-fail-load` reports it. */
export interface LoadFailure {
  code: number;
  /** Such as `ERR_CONNECTION_REFUSED`. */
  name: string;
}

export type TabStatus =
  /** Restored and never selected since: it has no view. */
  | { kind: "unloaded" }
  | { kind: "loading" }
  | { kind: "live" }
  /**
   * The page did not load. A retry is due after a backoff, or under way when
   * `retrying`; `attempt` counts the retries that failed.
   */
  | { kind: "failed"; reason: LoadFailure; attempt: number; retrying: boolean }
  /** The renderer is gone, for Electron's `reason`. */
  | { kind: "crashed"; reason: string };

export type TabEvent =
  /** The tab became the one on screen. */
  | { kind: "select" }
  | { kind: "loaded" }
  | { kind: "failed-to-load"; reason: LoadFailure }
  | { kind: "crashed"; reason: string }
  /** Asked for from the tab's retry or reload control. */
  | { kind: "retry" }
  /** The backoff after a failure ran out. */
  | { kind: "retry-due" }
  /** The network came back. */
  | { kind: "online" }
  /** Its URL changed in state, to be loaded. */
  | { kind: "navigate" };

export type TabEffect =
  /** Loads the tab's URL in its view, creating the view if it has none. */
  | { kind: "load" }
  /**
   * Replaces any retry scheduled before. One left over from an earlier failure
   * fires into a status that ignores it, so none is ever cancelled.
   */
  | { kind: "schedule-retry"; delay: number };

export interface Transition {
  status: TabStatus;
  effects: TabEffect[];
}

const RETRY_BASE = 1000;

const RETRY_CAP = 30_000;

/** The wait before retry `attempt`, doubling from a second to half a minute. */
export const retryDelay = (attempt: number) =>
  Math.min(RETRY_BASE * 2 ** attempt, RETRY_CAP);

const stay = (status: TabStatus): Transition => ({ status, effects: [] });

const load = (status: TabStatus): Transition => ({
  status,
  effects: [{ kind: "load" }],
});

const fail = (reason: LoadFailure, attempt: number): Transition => ({
  status: { kind: "failed", reason, attempt, retrying: false },
  effects: [{ kind: "schedule-retry", delay: retryDelay(attempt) }],
});

/**
 * A page that is loading or shown: `failures` is how many retries before
 * this load already failed.
 */
const whileLoaded = (
  status: TabStatus,
  event: TabEvent,
  failures: number
): Transition => {
  switch (event.kind) {
    case "loaded": {
      return stay({ kind: "live" });
    }
    case "failed-to-load": {
      return fail(event.reason, failures);
    }
    case "crashed": {
      return stay({ kind: "crashed", reason: event.reason });
    }
    case "navigate": {
      return load(status);
    }
    default: {
      return stay(status);
    }
  }
};

/** Waiting out the backoff before the next retry. */
const whileWaiting = (
  status: Extract<TabStatus, { kind: "failed" }>,
  event: TabEvent
): Transition => {
  switch (event.kind) {
    case "retry":
    case "retry-due":
    case "online":
    case "navigate": {
      return load({ ...status, retrying: true });
    }
    case "crashed": {
      return stay({ kind: "crashed", reason: event.reason });
    }
    // `loaded` here is the error page that follows a failure.
    default: {
      return stay(status);
    }
  }
};

/**
 * The next status of a tab and the effects that take it there, which the
 * caller runs before committing it. An event that means nothing in a status
 * leaves it as it is with nothing to run.
 */
export const transition = (status: TabStatus, event: TabEvent): Transition => {
  switch (status.kind) {
    case "unloaded": {
      return event.kind === "select" ? load({ kind: "loading" }) : stay(status);
    }
    case "loading":
    case "live": {
      return whileLoaded(status, event, 0);
    }
    case "failed": {
      return status.retrying
        ? whileLoaded(status, event, status.attempt + 1)
        : whileWaiting(status, event);
    }
    case "crashed": {
      return event.kind === "select" ||
        event.kind === "retry" ||
        event.kind === "navigate"
        ? load({ kind: "loading" })
        : stay(status);
    }
    default: {
      return stay(status);
    }
  }
};

/** A failed or crashed tab's view is hidden, so the shell can say why. */
export const showsView = (status: TabStatus) =>
  status.kind === "loading" || status.kind === "live";
