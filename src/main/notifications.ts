import { plural, t } from "@lingui/core/macro";

import type { FeedOutcome } from "#core/feed.ts";
import { MAIL_ACTIONS } from "#core/mail-actions.ts";
import type { MailAction } from "#core/mail-actions.ts";
import { messageUrl, noticesFor, takeNewMail } from "#core/notifications.ts";
import type { Notice, NotificationCopy, Seen } from "#core/notifications.ts";
import type { SettingKey, SettingValue } from "#core/settings.ts";
import type { State } from "#core/state.ts";
import type { Notifier, ShownNotification } from "#platform/notifications.ts";

import { profileDisplayName } from "./profile-copy.ts";

export interface MailNotificationsDeps {
  notifier: Notifier;
  /** Read as each notification is made, so a change applies to the next. */
  setting: <Key extends SettingKey>(key: Key) => SettingValue<Key>;
  state: () => State;
  /** Whether the system shows a subtitle, as macOS does. */
  hasSubtitle: boolean;
  /** Gmail's inbox, the registry's or the suite's stand-in. */
  inbox: string;
  /** Shows the profile's Gmail at `url` and brings the window forward. */
  open: (profileId: string, url: string) => void;
  /** Runs an action on a message, leaving the window where it is. */
  act: (profileId: string, action: MailAction, messageId: string) => void;
}

const actionLabels = (): Record<MailAction, string> => ({
  archive: t({
    message: "Archive",
    comment:
      "Button on a new email notification that archives the email. Gmail's own word for the action",
  }),
  markAsRead: t({
    message: "Mark as Read",
    comment:
      "Button on a new email notification that marks the email read. Gmail's own words for the action",
  }),
  delete: t({
    message: "Delete",
    comment:
      "Button on a new email notification that moves the email to Gmail's Trash. Gmail's own word for the action",
  }),
  markAsSpam: t({
    message: "Mark as Spam",
    comment:
      "Button on a new email notification that reports the email as spam. Gmail's own words for the action",
  }),
});

const copy = (): NotificationCopy => ({
  newMessage: t({
    message: "New message",
    comment:
      "Title of a notification for an email that arrived, when the person chose not to show who sent it",
  }),
  newMessages: (count) =>
    t({
      message: plural(count, {
        one: "# new message",
        other: "# new messages",
      }),
      comment:
        "Title of the one notification for several emails that arrived at once in a profile, which opens its inbox when clicked",
    }),
});

/**
 * Notifies the mail each poll of a profile finds new, as `takeNewMail`
 * decides, and opens it in its profile when one is clicked. One for a
 * single message offers `MAIL_ACTIONS` as its buttons. What was seen
 * is kept in memory only, and a profile's is dropped, with its notifications
 * closed, as it is removed.
 */
export const createMailNotifications = ({
  notifier,
  setting,
  state,
  hasSubtitle,
  inbox,
  open,
  act,
}: MailNotificationsDeps) => {
  const seen = new Map<string, Seen>();
  const shown = new Map<string, Set<ShownNotification>>();

  const show = (profileId: string, notice: Notice) => {
    const { link, messageId, ...content } = notice;
    const held = shown.get(profileId) ?? new Set<ShownNotification>();
    let notification: ShownNotification | undefined;

    shown.set(profileId, held);

    const labels = actionLabels();

    notification = notifier.show(
      messageId === undefined
        ? content
        : { ...content, actions: MAIL_ACTIONS.map((action) => labels[action]) },
      {
        onClick: () => {
          open(profileId, messageUrl(link, inbox));
        },
        onAction: (index) => {
          const action = MAIL_ACTIONS[index];

          if (action && messageId !== undefined) {
            act(profileId, action, messageId);
          }
        },
        onGone: () => {
          if (notification) {
            held.delete(notification);
          }

          notification = undefined;
        },
      }
    );

    if (notification) {
      held.add(notification);
    }
  };

  return {
    /** Told of each poll of a listed profile as it ends. */
    polled: (profileId: string, outcome: FeedOutcome) => {
      const current = state();
      const profile = current.profiles.find(
        (candidate) => candidate.id === profileId
      );

      if (!profile) {
        return;
      }

      const taken = takeNewMail(seen.get(profileId), outcome);

      seen.set(profileId, taken.seen);

      if (taken.fresh.length === 0 || !setting("notifications")) {
        return;
      }

      const notices = noticesFor(taken.fresh, {
        parts: {
          sender: setting("notificationSender"),
          subject: setting("notificationSubject"),
          summary: setting("notificationSummary"),
        },
        profileName:
          current.profiles.length > 1 ? profileDisplayName(profile) : undefined,
        hasSubtitle,
        copy: copy(),
      });

      for (const notice of notices) {
        show(profileId, notice);
      }
    },
    /** Forgets each profile no longer listed and closes its notifications. */
    follow: (current: State) => {
      const listed = new Set(current.profiles.map((profile) => profile.id));

      for (const profileId of new Set([...seen.keys(), ...shown.keys()])) {
        if (!listed.has(profileId)) {
          seen.delete(profileId);

          for (const notification of shown.get(profileId) ?? []) {
            notification.close();
          }

          shown.delete(profileId);
        }
      }
    },
  };
};
