import { plural, t } from "@lingui/core/macro";

import type { SoundRequest } from "#contract/shell-sound.ts";
import type { FeedEntry, FeedOutcome } from "#core/feed.ts";
import { MAIL_ACTIONS } from "#core/mail-actions.ts";
import type { MailAction } from "#core/mail-actions.ts";
import {
  decideNotification,
  importantOnly,
  momentOf,
} from "#core/notification-gate.ts";
import {
  codeNoticeFor,
  messageUrl,
  noticesFor,
  takeNewMail,
} from "#core/notifications.ts";
import type {
  Notice,
  NoticeOptions,
  NotificationCopy,
  Seen,
} from "#core/notifications.ts";
import type { SettingKey, SettingValue } from "#core/settings.ts";
import { decideSound, sounds } from "#core/sounds.ts";
import type { DoNotDisturb, Profile, State } from "#core/state.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import type {
  NotificationContent,
  NotificationEvents,
  Notifier,
  ShownNotification,
} from "#platform/notifications.ts";

import { profileDisplayName } from "./profile-copy.ts";

export interface MailNotificationsDeps {
  notifier: Notifier;
  /** Written with a verification code's digits and nothing else. */
  clipboard: Clipboard;
  /** The digits of the code `[subject, summary]` carries, if any. */
  extractCode: (texts: readonly string[]) => string | undefined;
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
  /** As the state holds it; one that has ended holds nothing. */
  doNotDisturb: () => DoNotDisturb | undefined;
  now: () => Date;
  /** The ids the profile's Important feed lists, or `null` if it failed. */
  important: (profileId: string) => Promise<ReadonlySet<string> | null>;
  /** Plays one of Meru's sounds, in the shell or the suite's capture. */
  playSound: (request: SoundRequest) => void;
  log: (message: string) => void;
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

const codeCopy = () => ({
  code: (verificationCode: string) =>
    t({
      message: `Verification code ${verificationCode}`,
      comment:
        "Text of the notification for an email that carries a one-time code, which its Copy button copies. {verificationCode} is the code's digits, such as 482910",
    }),
  copied: (verificationCode: string) =>
    t({
      message: `Copied verification code ${verificationCode}`,
      comment:
        "Text of the notification for an email that carries a one-time code, already copied to the clipboard. {verificationCode} is the code's digits, such as 482910",
    }),
  copy: t({
    message: "Copy",
    comment: "Button on a notification that copies the verification code",
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
 * closed, as it is removed. A message with a verification code gets the
 * code's notification in place of its own, which nothing holds.
 */
export const createMailNotifications = ({
  notifier,
  clipboard,
  extractCode,
  setting,
  state,
  hasSubtitle,
  inbox,
  open,
  act,
  doNotDisturb,
  now,
  important,
  playSound,
  log,
}: MailNotificationsDeps) => {
  const seen = new Map<string, Seen>();
  /** The label whose feed each profile's last feed came from. */
  const feedLabels = new Map<string, string | undefined>();
  const shown = new Map<string, Set<ShownNotification>>();
  /** When a notification of any profile last made a sound. */
  let lastSoundAt: number | undefined;

  /**
   * Shows it, held by its profile until it is gone or the profile is, with
   * the sound `notificationSound` and the quiet period since the last sound
   * give it.
   */
  const showFor = (
    profileId: string,
    content: NotificationContent,
    events: Omit<NotificationEvents, "onGone">
  ) => {
    const held = shown.get(profileId) ?? new Set<ShownNotification>();
    const time = now().getTime();
    const sound = decideSound(setting("notificationSound"), time, lastSoundAt);
    let notification: ShownNotification | undefined;

    shown.set(profileId, held);
    notification = notifier.show(
      { ...content, silent: sound.silent },
      {
        ...events,
        onGone: () => {
          if (notification) {
            held.delete(notification);
          }

          notification = undefined;
        },
      }
    );

    if (!notification) {
      return;
    }

    held.add(notification);

    if (sounds(sound)) {
      lastSoundAt = time;
    }

    if (sound.play) {
      playSound({
        sound: sound.play,
        volume: setting("notificationSoundVolume"),
      });
    }
  };

  const show = (profileId: string, notice: Notice) => {
    const { link, messageId, ...content } = notice;
    const labels = actionLabels();

    showFor(
      profileId,
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
      }
    );
  };

  /**
   * Copies the code, then marks its message read or moves it to Trash as
   * set, Trash winning, and answers whether it was copied; nothing touches
   * the mail unless the code landed. The code is never logged.
   */
  const copyCode = async (
    profileId: string,
    code: string,
    messageId: string
  ) => {
    try {
      await clipboard.writeText(code);
    } catch {
      log(`A verification code of profile ${profileId} was not copied`);

      return false;
    }

    // A profile removed while the write was pending has no mail to touch.
    if (!state().profiles.some((profile) => profile.id === profileId)) {
      return true;
    }

    let followUp: MailAction | undefined;

    if (setting("verificationCodeTrash")) {
      followUp = "delete";
    } else if (setting("verificationCodeMarkRead")) {
      followUp = "markAsRead";
    }

    if (followUp) {
      act(profileId, followUp, messageId);
    }

    log(
      `Copied a verification code of profile ${profileId}${followUp ? `, then ran ${followUp}` : ""}`
    );

    return true;
  };

  const showCode = async (
    profileId: string,
    entry: FeedEntry,
    code: string,
    options: NoticeOptions
  ) => {
    const decision = decideNotification({
      kind: "verificationCode",
      notifications: setting("notifications"),
      quietHours: setting("quietHours"),
      doNotDisturb: doNotDisturb(),
      now: momentOf(now()),
    });

    if (!decision.show) {
      return;
    }

    const url = messageUrl(entry.link, inbox);

    if (setting("verificationCodeCopyMode") === "immediately") {
      log(
        `Found a verification code in a new message of profile ${profileId}, copying it`
      );

      const copied = await copyCode(profileId, code, entry.id);

      if (!state().profiles.some((profile) => profile.id === profileId)) {
        return;
      }

      // "Copied" only once it is; otherwise the person can still ask.
      if (copied) {
        showFor(
          profileId,
          codeNoticeFor(entry, codeCopy().copied(code), options),
          {
            onClick: () => {
              open(profileId, url);
            },
          }
        );

        return;
      }
    } else {
      log(
        `Found a verification code in a new message of profile ${profileId}, copying it when asked`
      );
    }

    // The button and a body click after it must not move the mail twice, but
    // a copy that failed may be asked for again.
    let copying: Promise<boolean> | undefined;
    const copyOnce = () => {
      copying ??= copyCode(profileId, code, entry.id).then((copied) => {
        if (!copied) {
          copying = undefined;
        }

        return copied;
      });
    };

    showFor(
      profileId,
      {
        ...codeNoticeFor(entry, codeCopy().code(code), options),
        actions: [codeCopy().copy],
      },
      {
        // The button copies without bringing Meru forward, which a body
        // click on macOS always does, so the body is the fallback.
        onAction: copyOnce,
        onClick: () => {
          copyOnce();
          open(profileId, url);
        },
      }
    );
  };

  return {
    /**
     * Told of each poll of a listed profile as it ends, with the label whose
     * feed it read. Held mail stays seen and is never notified later. The
     * first feed of the whole inbox after a label's is only recorded, since
     * what it lists beyond the label's is not new; a label's feed after the
     * whole inbox's lists nothing the inbox did not, so its new mail is
     * still notified. Important only asks the Important feed just when there
     * is something to notify.
     */
    polled: async (profileId: string, outcome: FeedOutcome, label?: string) => {
      const listed = () =>
        state().profiles.find((candidate) => candidate.id === profileId);

      const profile = listed();

      if (!profile) {
        return;
      }

      const widened =
        outcome.kind === "feed" &&
        label === undefined &&
        feedLabels.get(profileId) !== undefined;

      if (outcome.kind === "feed") {
        feedLabels.set(profileId, label);
      }

      const taken = takeNewMail(
        widened ? undefined : seen.get(profileId),
        outcome
      );

      seen.set(profileId, taken.seen);

      const optionsFor = (named: Profile): NoticeOptions => ({
        parts: {
          sender: setting("notificationSender"),
          subject: setting("notificationSubject"),
          summary: setting("notificationSummary"),
        },
        profileName:
          state().profiles.length > 1 ? profileDisplayName(named) : undefined,
        hasSubtitle,
        copy: copy(),
      });

      // Ahead of every hold and of Important only, which a code passes, and
      // never told as one of many or counted toward that.
      let fresh: FeedEntry[] = [];

      for (const entry of taken.fresh) {
        const code = setting("verificationCodes")
          ? extractCode([entry.subject, entry.summary])
          : undefined;

        if (code === undefined) {
          fresh.push(entry);
        } else {
          void showCode(profileId, entry, code, optionsFor(profile));
        }
      }

      if (fresh.length === 0) {
        return;
      }

      const held = () => {
        const decision = decideNotification({
          kind: "newMail",
          notifications: setting("notifications"),
          quietHours: setting("quietHours"),
          doNotDisturb: doNotDisturb(),
          now: momentOf(now()),
        });

        if (!decision.show) {
          log(
            `Held ${fresh.length} new mail notification(s) of profile ${profileId}: ${decision.reason}`
          );
        }

        return !decision.show;
      };

      if (held()) {
        return;
      }

      if (setting("notificationImportantOnly")) {
        const ids = await important(profileId);

        if (ids === null) {
          log(
            `The Important feed of profile ${profileId} was not read, so all new mail is notified`
          );
        }

        fresh = importantOnly(fresh, ids);

        // Asked again, since what holds may have begun during the read.
        if (held()) {
          return;
        }
      }

      const stillListed = listed();

      if (fresh.length === 0 || !stillListed) {
        return;
      }

      for (const notice of noticesFor(fresh, optionsFor(stillListed))) {
        show(profileId, notice);
      }
    },
    /** Forgets each profile no longer listed and closes its notifications. */
    follow: (current: State) => {
      const listed = new Set(current.profiles.map((profile) => profile.id));

      for (const profileId of new Set([...seen.keys(), ...shown.keys()])) {
        if (!listed.has(profileId)) {
          seen.delete(profileId);
          feedLabels.delete(profileId);

          for (const notification of shown.get(profileId) ?? []) {
            notification.close();
          }

          shown.delete(profileId);
        }
      }
    },
  };
};
