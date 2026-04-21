import { IpcEmitter, IpcListener } from "@electron-toolkit/typed-ipc/renderer";
import { t } from "@meru/i18n";
import type { IpcMainEvents, IpcRendererEvent } from "@meru/shared/types";
import { toast } from "sonner";
import { refreshInbox, sendMailAction } from "./inbox";

export const ipcRenderer = new IpcListener<IpcRendererEvent>();

export const ipcMain = new IpcEmitter<IpcMainEvents>();

ipcRenderer.on("gmail.navigateTo", (_event, destination) => {
  window.location.hash = `#${destination}`;
});

ipcRenderer.on("gmail.openMessage", (_event, messageId: string) => {
  window.location.hash = `#inbox/${messageId}`;
});

ipcRenderer.on("gmail.handleMessage", async (_event, messageId, action) => {
  await sendMailAction(messageId, action);

  refreshInbox();
});

ipcRenderer.on("gmail.showMessageSentNotification", (_event, browserWindowId: number) => {
  toast.success(t("toast.messageSent"), {
    id: browserWindowId,
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
    action: {
      label: t("toast.undo"),
      onClick: () => {
        ipcMain.send("gmail.undoMessageSent", browserWindowId);
      },
    },
  });
});

ipcRenderer.on("gmail.dismissMessageSentNotification", (_event, browserWindowId: number) => {
  toast.dismiss(browserWindowId);
});
