import { clamp } from "es-toolkit";

import type { UpdaterEvent } from "../ports.ts";
import type { UpdateState } from "../records/update.ts";

export const IDLE_UPDATE: UpdateState = { kind: "idle" };

/** The update state after the updater reports `event`. */
export const advance = (
  state: UpdateState,
  event: UpdaterEvent
): UpdateState => {
  switch (event.kind) {
    case "checking": {
      return { kind: "checking" };
    }
    case "available": {
      return { kind: "available", version: event.version };
    }
    case "notAvailable": {
      return IDLE_UPDATE;
    }
    case "progress": {
      return {
        kind: "downloading",
        percent: clamp(event.percent, 0, 100),
      };
    }
    case "downloaded": {
      return { kind: "ready", version: event.version };
    }
    case "error": {
      // A downloaded update still installs on quit whatever a later check runs into.
      return state.kind === "ready"
        ? state
        : { kind: "error", message: event.message };
    }
    default: {
      const unknown: never = event;
      return unknown;
    }
  }
};

/** Whether a downloaded update waits to be installed. */
export const canInstall = (state: UpdateState): boolean =>
  state.kind === "ready";

/** Whether an update is on its way or waiting, so another check would find nothing new. */
export const isBusy = (state: UpdateState): boolean =>
  state.kind === "downloading" || state.kind === "ready";
