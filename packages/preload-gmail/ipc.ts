import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
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

/*
 * Nothing but the compose window closing after a send asks for this toast, and
 * that only happens when the setting is on: `mail.ts` gates its one
 * `gmail.closeComposeWindow` send on the same flag, and the main process sends
 * both messages below from that handler alone. The setting is `restartRequired`,
 * so argv settles it for the life of the view.
 */
if (process.argv.includes(GMAIL_PRELOAD_ARGUMENTS.closeComposeWindowAfterSend)) {
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
}
