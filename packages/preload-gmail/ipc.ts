import { ipc } from "@meru/shared/renderer/ipc";
import { toast } from "sonner";
import { refreshInbox, sendMailAction } from "./inbox";

ipc.renderer.on("gmail.navigateTo", (_event, destination) => {
  window.location.hash = `#${destination}`;
});

ipc.renderer.on("gmail.openMessage", (_event, messageId: string) => {
  window.location.hash = `#inbox/${messageId}`;
});

ipc.renderer.on("gmail.handleMessage", async (_event, messageId, action) => {
  await sendMailAction(messageId, action);

  refreshInbox();
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
