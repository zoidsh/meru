import type { LogPort } from "../../core/log.ts";
import type { Clock, LifecyclePort, Unsubscribe } from "../../core/ports.ts";

/** How many console errors a page may have written in a window before the rest of the window's are only counted. */
export const PAGE_ERRORS_PER_WINDOW = 20;

export const PAGE_ERROR_WINDOW = 60_000;

interface FailureLogOptions {
  readonly lifecycle: Pick<LifecyclePort, "onFailure" | "quit">;
  readonly clock: Pick<Clock, "now">;
  readonly log: LogPort;
  /** Whether a page is one of the app's own; Google's pages write errors of their own all day, which say nothing about the app. */
  readonly ownPage: (url: string) => boolean;
}

/** Writes each failure nothing else handled to the log, and quits after an uncaught exception. */
export const logFailures = ({
  clock,
  lifecycle,
  log,
  ownPage,
}: FailureLogOptions): Unsubscribe => {
  // A page that logs in a loop would otherwise fill the log, by web contents, since two pages can share an address.
  const pages = new Map<
    number,
    { readonly since: number; written: number; dropped: number; url: string }
  >();
  const pageError = (contentsId: number, url: string): boolean => {
    const now = clock.now();
    for (const [id, page] of pages) {
      if (now - page.since >= PAGE_ERROR_WINDOW) {
        if (page.dropped > 0) {
          log.warn("A page's errors were dropped", {
            dropped: page.dropped,
            url: page.url,
          });
        }
        pages.delete(id);
      }
    }
    const page = pages.get(contentsId) ?? {
      dropped: 0,
      since: now,
      url,
      written: 0,
    };
    pages.set(contentsId, page);
    page.url = url;
    if (page.written < PAGE_ERRORS_PER_WINDOW) {
      page.written += 1;
      return true;
    }
    page.dropped += 1;
    return false;
  };
  return lifecycle.onFailure((failure) => {
    switch (failure.kind) {
      case "uncaught": {
        log.error("An exception was not caught", { error: failure.error });
        // Node would have ended the process, and state an exception left half changed is not worth carrying on with; the quit still writes what it holds and flushes the log.
        lifecycle.quit();
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
        if (
          ownPage(failure.url) &&
          pageError(failure.contentsId, failure.url)
        ) {
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
};
