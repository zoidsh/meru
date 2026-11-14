import type { LogPort } from "../../core/log.ts";
import type { LifecyclePort, Unsubscribe } from "../../core/ports.ts";

export interface FailureLogOptions {
  readonly lifecycle: Pick<LifecyclePort, "onFailure">;
  readonly log: LogPort;
  /** Whether a page is one of the app's own; Google's pages write errors of their own all day, which say nothing about the app. */
  readonly ownPage: (url: string) => boolean;
}

/** Writes each failure nothing else handled to the log. */
export const logFailures = ({
  lifecycle,
  log,
  ownPage,
}: FailureLogOptions): Unsubscribe =>
  lifecycle.onFailure((failure) => {
    switch (failure.kind) {
      case "uncaught": {
        log.error("An exception was not caught", { error: failure.error });
        break;
      }
      case "unhandledRejection": {
        log.error("A rejected promise was not handled", {
          error: failure.error,
        });
        break;
      }
      case "processGone": {
        if (failure.reason !== "clean-exit") {
          const { exitCode, process, reason, url } = failure;
          log.error("A process ended", { exitCode, process, reason, url });
        }
        break;
      }
      case "consoleError": {
        if (ownPage(failure.url)) {
          const { line, message, source, url } = failure;
          log.error("A page logged an error", {
            line,
            source,
            text: message,
            url,
          });
        }
        break;
      }
      default: {
        break;
      }
    }
  });
