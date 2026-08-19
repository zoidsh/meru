import { ipc } from "@meru/shared/renderer/ipc";
import { toast } from "sonner";
import { refreshInbox, sendMailAction } from "./inbox";

ipc.renderer.on("gmail.navigateTo", (_event, destination) => {
  window.location.hash = `#${destination}`;
});

ipc.renderer.on("gmail.openMessage", (_event, messageId: string) => {
  window.location.hash = `#inbox/${messageId}`;
});

async function handleMessage(messageId: string, action: Parameters<typeof sendMailAction>[1]) {
  await sendMailAction(messageId, action);

  refreshInbox();
}

ipc.renderer.on("gmail.handleMessage", (_event, messageId, action) => {
  void handleMessage(messageId, action);
});

ipc.renderer.on("gmail.showMessageSentNotification", (_event, browserWindowId: number) => {
  toast.success("Message sent", {
    id: browserWindowId,
    duration: Number.POSITIVE_INFINITY,
    closeButton: true,
    action: {
      label: "Undo",
      onClick: () => {
        ipc.main.send("gmail.undoMessageSent", browserWindowId);
      },
    },
  });
});

ipc.renderer.on("gmail.dismissMessageSentNotification", (_event, browserWindowId: number) => {
  toast.dismiss(browserWindowId);
});
