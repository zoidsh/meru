export interface FailureDeps {
  productName: string;
  /** Blocks until dismissed; Chromium handles no signal meanwhile. */
  showErrorDialog: (title: string, message: string) => void;
  log: (message: string) => void;
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

const describe = (error: unknown) =>
  error instanceof Error ? (error.stack ?? error.message) : String(error);

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
        log(`${productName} could not start: ${detail}`);
        showErrorDialog(`${productName} could not start`, detail);
        exit(1);
      } else if (phase === "running") {
        log(`Unexpected error in the main process: ${detail}`);
      } else if (phase === "quitting") {
        log(`Interrupted by quitting: ${detail}`);
      }
    },
  };
};
