import { t } from "@lingui/core/macro";
import { noop } from "es-toolkit";

import { decideNotification, momentOf } from "#core/notification-gate.ts";
import type { QuietWindow } from "#core/notification-gate.ts";
import type { DoNotDisturb } from "#core/state.ts";
import type { Notifier } from "#platform/notifications.ts";

import type { EndedDownload } from "./downloads.ts";

export interface DownloadNotificationsDeps {
  notifier: Notifier;
  isMacOS: boolean;
  /** Every notification shown silent, as under the background flag. */
  quiet: boolean;
  quietHours: () => readonly QuietWindow[];
  /** As the state holds it; one that has ended holds nothing. */
  doNotDisturb: () => DoNotDisturb | undefined;
  now: () => Date;
  /** Shows the finished download's file in its folder. */
  showInFolder: (id: string) => void;
  /** Shows the Downloads card, its window brought forward. */
  showList: () => void;
  log: (message: string) => void;
}

/**
 * Tells of each download that finished, "Downloaded" and its name, choosing
 * which shows the file in its folder, and of each that failed, which shows
 * the list; one cancelled tells nothing. Quiet hours and Do Not Disturb hold
 * both.
 */
export const createDownloadNotifications = ({
  notifier,
  isMacOS,
  quiet,
  quietHours,
  doNotDisturb,
  now,
  showInFolder,
  showList,
  log,
}: DownloadNotificationsDeps) => ({
  ended: ({ id, fileName, end }: EndedDownload) => {
    if (end === "cancelled") {
      return;
    }

    const decision = decideNotification({
      kind: "download",
      // Notification when a download completes, its own setting, is on
      // until the Settings window lets it be turned off.
      notifications: true,
      quietHours: quietHours(),
      doNotDisturb: doNotDisturb(),
      now: momentOf(now()),
    });

    if (!decision.show) {
      log(`Held a download's notification: ${decision.reason}`);

      return;
    }

    if (end === "failed") {
      notifier.show(
        {
          title: t({
            message: "Download failed",
            comment:
              "Title of the system notification when a download stops before it is done; the file's name is its text",
          }),
          body: fileName,
          silent: quiet,
        },
        { onClick: showList, onGone: noop }
      );

      return;
    }

    const show = () => {
      showInFolder(id);
    };

    notifier.show(
      {
        title: t({
          message: `Downloaded ${fileName}`,
          comment:
            "Title of the system notification when a download is done; {fileName} is the file's name",
        }),
        body: "",
        actions: [
          isMacOS
            ? t({
                message: "Show in Finder",
                comment:
                  "Button on the macOS notification of a finished download that shows the file in Finder",
              })
            : t({
                message: "Show in folder",
                comment:
                  "Button on the Windows and Linux notification of a finished download that shows the file in its folder",
              }),
        ],
        silent: quiet,
      },
      { onClick: show, onAction: show, onGone: noop }
    );
  },
});
