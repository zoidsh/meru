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

ipc.renderer.on("gmail.showMessageSentNotification", async (_event, browserWindowId: number) => {
  // Asked for on every toast rather than cached, so the strings follow a
  // language changed since the view loaded.
  const messages = await ipc.main.invoke("i18n.getGmailMessages");

  // No duration: the main process ends this one when it closes the compose
  // window, 30 seconds in, which is Gmail's own undo-send window.
  showToast({
    id: browserWindowId,
    title: messages.messageSent,
    action: {
      label: messages.undo,
      onClick: () => {
        ipc.main.send("gmail.undoMessageSent", browserWindowId);
      },
    },
    labels: {
      toasts: messages.toasts,
      close: messages.closeToast,
    },
  });
});

ipc.renderer.on("gmail.dismissMessageSentNotification", (_event, browserWindowId: number) => {
  dismissToast(browserWindowId);
});
