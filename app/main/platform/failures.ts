import { app } from "electron";
import type {
  Details,
  Event,
  RenderProcessGoneDetails,
  WebContents,
  WebContentsConsoleMessageEventParams,
} from "electron";

import { DisposableStore } from "../../core/disposable.ts";
import type { LifecyclePort } from "../../core/ports.ts";

/** Hears what goes wrong outside any feature's own handling: an exception or a rejection nothing caught, a process that ended, and an error a page wrote to its console. */
export const onFailure: LifecyclePort["onFailure"] = (listener) => {
  const uncaught = (error: Error) => {
    listener({ error, kind: "uncaught" });
  };
  const rejection = (reason: unknown) => {
    listener({ error: reason, kind: "unhandledRejection" });
  };
  const renderGone = (
    _event: Event,
    contents: WebContents,
    details: RenderProcessGoneDetails
  ) => {
    listener({
      exitCode: details.exitCode,
      kind: "processGone",
      process: "renderer",
      reason: details.reason,
      url: contents.getURL(),
    });
  };
  const childGone = (_event: Event, details: Details) => {
    listener({
      exitCode: details.exitCode,
      kind: "processGone",
      process: details.type,
      reason: details.reason,
      url: "",
    });
  };
  const detach = new DisposableStore();
  const created = (_event: Event, contents: WebContents) => {
    const message = (event: Event<WebContentsConsoleMessageEventParams>) => {
      if (event.level === "error") {
        listener({
          kind: "consoleError",
          line: event.lineNumber,
          message: event.message,
          source: event.sourceId,
          url: contents.getURL(),
        });
      }
    };
    contents.on("console-message", message);
    const off = detach.track(() => {
      contents.off("console-message", message);
      contents.off("destroyed", off);
    });
    contents.once("destroyed", off);
  };
  process.on("uncaughtException", uncaught);
  process.on("unhandledRejection", rejection);
  app.on("render-process-gone", renderGone);
  app.on("child-process-gone", childGone);
  app.on("web-contents-created", created);
  return () => {
    process.off("uncaughtException", uncaught);
    process.off("unhandledRejection", rejection);
    app.off("render-process-gone", renderGone);
    app.off("child-process-gone", childGone);
    app.off("web-contents-created", created);
    detach.dispose();
  };
};
