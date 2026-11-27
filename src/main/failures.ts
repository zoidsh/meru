import { t } from "@lingui/core/macro";

import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";

export interface FailureDeps {
  productName: string;
  /** Blocks until dismissed; Chromium handles no signal meanwhile. */
  showErrorDialog: (title: string, message: string) => void;
  log: Log;
  exit: (code: number) => void;
}

export interface Failures {
  /** Startup has finished; later errors are not startup failures. */
  markStarted: () => void;
  /** Quitting has begun; work it interrupts is not a failure. */
  markQuitting: () => void;
  /** For a startup step that threw and for `uncaughtException`. */
  report: (error: unknown) => void;
}

/** A failure whose message is written for the person, shown without a stack. */
export class StartupError extends Error {
  override name = "StartupError";
}

const describe = (error: unknown) => {
  if (error instanceof StartupError) {
    return error.message;
  }

  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
};

/**
 * Decides what an error means by when it happens. During startup it ends the
 * app with a dialog rather than a silent exit; once quitting has begun it is
 * the quit cancelling a load, and the quit goes on; after startup it is logged
 * and the app keeps running.
 */
export const createFailures = ({
  productName,
  showErrorDialog,
  log,
  exit,
}: FailureDeps): Failures => {
  let phase: "starting" | "running" | "quitting" | "failed" = "starting";

  return {
    markStarted: () => {
      if (phase === "starting") {
        phase = "running";
      }
    },
    markQuitting: () => {
      if (phase !== "failed") {
        phase = "quitting";
      }
    },
    report: (error) => {
      const detail = describe(error);

      if (phase === "starting") {
        phase = "failed";
        log("start-failed", { error: scrub.stack(error) });
        showErrorDialog(
          t({
            message: `${productName} could not start`,
            comment:
              "Title of the error dialog shown when the app fails to open; {productName} is the app's name",
          }),
          detail
        );
        exit(1);
      } else if (phase === "running") {
        log("main-error", { error: scrub.stack(error) });
      } else if (phase === "quitting") {
        log("quit-interrupted", { error: scrub.error(error) });
      }
    },
  };
};
