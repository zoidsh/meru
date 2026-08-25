import { ipc } from "@meru/shared/renderer/ipc";
import { refreshInbox, sendMailAction } from "./inbox";
import { dismissToast, showToast } from "./toast";

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
  // No duration: the main process ends this one when it closes the compose
  // window, 30 seconds in, which is Gmail's own undo-send window.
  showToast({
    id: browserWindowId,
    title: "Message sent",
    action: {
      label: "Undo",
      onClick: () => {
        ipc.main.send("gmail.undoMessageSent", browserWindowId);
      },
    },
  });
});

ipc.renderer.on("gmail.dismissMessageSentNotification", (_event, browserWindowId: number) => {
  dismissToast(browserWindowId);
});
