import { ipc } from "@meru/shared/renderer/ipc";
import { refreshInbox, sendMailAction } from "./inbox";
import { dismissMessageSentToast, showMessageSentToast } from "./toaster";

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
  showMessageSentToast(browserWindowId);
});

ipc.renderer.on("gmail.dismissMessageSentNotification", (_event, browserWindowId: number) => {
  dismissMessageSentToast(browserWindowId);
});
