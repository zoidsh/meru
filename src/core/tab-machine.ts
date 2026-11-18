/** Chromium's net error, as `did-fail-load` reports it. */
export interface LoadFailure {
  code: number;
  /** Such as `ERR_CONNECTION_REFUSED`. */
  name: string;
}

export type TabStatus =
  /**
   * It has no page: restored and neither selected nor opened since, or put to
   * sleep. Either is asleep to a person.
   */
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
  /** Loads the tab without showing it, as Open at Launch does. */
  | { kind: "open" }
  | { kind: "loaded" }
  | { kind: "failed-to-load"; reason: LoadFailure }
  | { kind: "crashed"; reason: string }
  /** Asked for from the tab's retry or reload control. */
  | { kind: "retry" }
  /** Asked for by the Reload command. */
  | { kind: "reload" }
  /** The backoff after a failure ran out. */
  | { kind: "retry-due" }
  /** The network came back. */
  | { kind: "online" }
  /** Its URL changed in state, to be loaded. */
  | { kind: "navigate" }
  /** Asked for by the Sleep command, to free its page. */
  | { kind: "sleep" };

export type TabEffect =
  /** Loads the tab's URL in its view, creating the view if it has none. */
  | { kind: "load" }
  /** Reloads the page the view shows, where it is now. */
  | { kind: "reload" }
  /**
   * Replaces any retry scheduled before. One left over from an earlier failure
   * fires into a status that ignores it, so none is ever cancelled.
   */
  | { kind: "schedule-retry"; delay: number }
  /**
   * Closes the view, its page and any retry with it, keeping where the page
   * was for the next load.
   */
  | { kind: "discard" };

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
    // A retry under way loads the tab's URL again, as the error page is no
    // page to reload.
    case "reload": {
      return status.kind === "failed"
        ? load(status)
        : { status: { kind: "loading" }, effects: [{ kind: "reload" }] };
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
    case "reload":
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
  if (event.kind === "sleep") {
    return status.kind === "unloaded"
      ? stay(status)
      : { status: { kind: "unloaded" }, effects: [{ kind: "discard" }] };
  }

  switch (status.kind) {
    case "unloaded": {
      return event.kind === "select" || event.kind === "open"
        ? load({ kind: "loading" })
        : stay(status);
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
        event.kind === "reload" ||
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
