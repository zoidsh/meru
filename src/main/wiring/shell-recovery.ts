import type { createAppLifecycle } from "#platform/app.ts";
import type { ErrorDialog } from "#platform/dialog.ts";

import { createShellRecovery } from "../shell-recovery.ts";
import type { createShellWindow } from "../shell-window.ts";

/** The shell's page loaded again should its process die. */
export const wireShellRecovery = ({
  lifecycle,
  errorDialog,
  shell,
}: {
  lifecycle: ReturnType<typeof createAppLifecycle>;
  errorDialog: ErrorDialog;
  shell: ReturnType<typeof createShellWindow>;
}) => {
  createShellRecovery({
    window: shell.window,
    productName: lifecycle.name,
    now: Date.now,
    showErrorDialog: errorDialog.show,
    quit: lifecycle.quit,
    log: console.error,
  });
};
