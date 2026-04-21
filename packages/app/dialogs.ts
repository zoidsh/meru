import { t } from "@meru/i18n";
import { app, dialog } from "electron";

export async function showRestartDialog() {
  const { response } = await dialog.showMessageBox({
    type: "info",
    buttons: [t("dialogs.restart.restart"), t("dialogs.restart.later")],
    message: t("dialogs.restart.message"),
    detail: t("dialogs.restart.detail"),
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    app.relaunch();
    app.quit();
  }
}
