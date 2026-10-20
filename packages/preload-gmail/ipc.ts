import { t } from "@lingui/core/macro";
import { ipc } from "@meru/shared/renderer/ipc";
import { refreshInbox, sendMailAction } from "./inbox";
import { dismissToast, showToast } from "./toast";

ipc.renderer.on("gmail.navigateTo", (_event, destination) => {
  window.location.hash = `#${destination}`;
});

ipc.renderer.on("gmail.openMessage", (_event, messageId: string) => {
  window.location.hash = `#inbox/${messageId}`;
});

ipc.renderer.on("gmail.handleMessage", async (_event, messageId, action, requestId) => {
  let success = true;

  try {
    await sendMailAction(messageId, action);

    refreshInbox();
  } catch (error) {
    console.error("Error handling message:", error);

    success = false;
  }

  ipc.main.send("gmail.messageHandled", requestId, success);
});

ipc.renderer.on("gmail.refreshInbox", () => {
  refreshInbox();
});

ipc.renderer.on("gmail.showMessageSentNotification", (_event, browserWindowId) => {
  // No duration: the main process ends this one when it closes the compose
  // window, 30 seconds in, which is Gmail's own undo-send window.
  showToast({
    id: browserWindowId,
    title: t({
      message: "Message sent",
      comment: "Toast in the Gmail view once a message has been sent",
    }),
    action: {
      label: t({
        message: "Undo",
        context: "button",
        comment: "Button in the message-sent toast, which recalls the message",
      }),
      onClick: () => {
        ipc.main.send("gmail.undoMessageSent", browserWindowId);
      },
    },
    labels: {
      toasts: t({
        message: "Notifications",
        comment: "Accessible name of the region Meru's own toasts appear in",
      }),
      close: t({
        message: "Close toast",
        comment:
          "Accessible name of the close button on a brief notification Meru shows over Gmail",
      }),
    },
  });
});

ipc.renderer.on("gmail.dismissMessageSentNotification", (_event, browserWindowId: number) => {
  dismissToast(browserWindowId);
});
