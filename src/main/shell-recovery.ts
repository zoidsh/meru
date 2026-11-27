import { t } from "@lingui/core/macro";

import type { Log } from "#core/log.ts";
import type { AppWindow } from "#platform/window.ts";

/** How many reloads a minute may bring before a renderer is given up on. */
export const SHELL_RELOAD_LIMIT = 3;

export const SHELL_RELOAD_WINDOW_MS = 60_000;

/**
 * Reloads a window's page when its process dies. Should it die again and
 * again, a reload loop would only spin, so past the limit `giveUp` runs
 * instead.
 */
export const createRendererRecovery = ({
  window,
  renderer,
  now,
  giveUp,
  log,
}: {
  window: Pick<AppWindow, "onRendererGone" | "reload">;
  /** Which renderer, as the log names it. */
  renderer: "shell" | "settings";
  now: () => number;
  giveUp: () => void;
  log: Log;
}) => {
  let reloads: number[] = [];

  window.onRendererGone((reason) => {
    if (reason === "clean-exit") {
      return;
    }

    const at = now();

    reloads = reloads.filter((when) => at - when < SHELL_RELOAD_WINDOW_MS);

    if (reloads.length >= SHELL_RELOAD_LIMIT) {
      log("renderer-gone", {
        renderer,
        reason,
        reloads: reloads.length,
        next: "given-up",
      });
      giveUp();

      return;
    }

    reloads.push(at);
    log("renderer-gone", { renderer, reason, next: "reloaded" });
    window.reload();
  });
};

/**
 * Reloads the shell's page when its process dies, the tabs' pages, in
 * processes of their own, staying as they are. Past the limit the person is
 * told and the app quits.
 */
export const createShellRecovery = ({
  window,
  productName,
  now,
  showErrorDialog,
  quit,
  log,
}: {
  window: Pick<AppWindow, "onRendererGone" | "reload">;
  productName: string;
  now: () => number;
  /** Blocks until dismissed. */
  showErrorDialog: (title: string, message: string) => void;
  quit: () => void;
  log: Log;
}) => {
  createRendererRecovery({
    window,
    renderer: "shell",
    now,
    giveUp: () => {
      showErrorDialog(
        t({
          message: `${productName} could not draw its window`,
          comment:
            "Title of the error dialog shown when the app's window keeps failing to draw and the app quits; {productName} is the app's name",
        }),
        t({
          message: `The window stopped drawing several times in a row, so ${productName} will quit. Open it again to carry on.`,
          comment:
            "Body of the error dialog shown when the app's window keeps failing to draw; {productName} is the app's name",
        })
      );
      quit();
    },
    log,
  });
};
