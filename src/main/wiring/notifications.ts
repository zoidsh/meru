import type { App } from "#core/apps.ts";
import { IMPORTANT_LABEL } from "#core/notification-gate.ts";
import { extractVerificationCode } from "#core/verification-code.ts";
import type { createClipboard } from "#platform/clipboard.ts";
import type { createIpc } from "#platform/ipc.ts";
import type { Notifier } from "#platform/notifications.ts";

import type { createMailActions } from "../mail-actions.ts";
import type { MailPoller } from "../mail.ts";
import { createMailNotifications } from "../notifications.ts";
import type { Profiles } from "../profiles.ts";
import type { SettingsStore } from "../settings.ts";
import type { createShellWindow } from "../shell-window.ts";
import type { createShowGmail } from "../show-gmail.ts";
import { soundOutput } from "./test-build.ts";

/**
 * A notification for new mail, with its sound and its actions, where there
 * is a Gmail to open it in.
 */
export const wireNotifications = ({
  isMacOS,
  background,
  ipc,
  shell,
  shellOrigin,
  settings,
  profiles,
  mail,
  gmail,
  mailActions,
  showGmail,
  revealGmail,
  clipboard,
  notifier,
}: {
  isMacOS: boolean;
  background: boolean;
  ipc: ReturnType<typeof createIpc>;
  shell: ReturnType<typeof createShellWindow>;
  shellOrigin: string;
  settings: SettingsStore;
  profiles: Profiles;
  mail: MailPoller;
  gmail: App | undefined;
  mailActions: ReturnType<typeof createMailActions> | undefined;
  showGmail: ReturnType<typeof createShowGmail>;
  revealGmail: (profileId: string) => void;
  clipboard: ReturnType<typeof createClipboard>;
  notifier: Notifier;
}) => {
  if (gmail && mailActions) {
    const mailNotifications = createMailNotifications({
      notifier,
      clipboard,
      extractCode: extractVerificationCode,
      setting: settings.get,
      state: profiles.get,
      hasSubtitle: isMacOS,
      inbox: gmail.home,
      open: async (profileId, url) => {
        if (!(await showGmail.openMessage(profileId, url))) {
          return;
        }

        // The one place main takes the foreground, since the person asked
        // for it by clicking; never under the background flag.
        revealGmail(profileId);
      },
      act: (profileId, action, messageId) => {
        void mailActions.run(profileId, action, messageId);
      },
      doNotDisturb: () => profiles.get().doNotDisturb,
      now: () => new Date(),
      important: async (profileId) => {
        const outcome = await mail.readLabel(profileId, IMPORTANT_LABEL);

        return outcome.kind === "feed"
          ? new Set(outcome.feed.entries.map((entry) => entry.id))
          : null;
      },
      sound: soundOutput({
        ipc,
        shellId: shell.window.webContentsId,
        shellOrigin,
        background,
        log: console.error,
      }),
      log: console.error,
    });

    // A removed profile's actions stop here, before its data is cleared.
    profiles.onChange(mailActions.follow);
    mail.onPoll((profileId, outcome, _startedAt, label) => {
      void mailNotifications.polled(profileId, outcome, label);
    });
    profiles.onChange(mailNotifications.follow);
  }
};
