import type { ShellState } from "#contract/shell.ts";
import type { FeedOutcome } from "#core/feed.ts";
import { afterPoll, inboxKey, inboxRows } from "#core/inbox.ts";
import type { PendingAction } from "#core/inbox.ts";
import type { ActionOutcome, MailAction } from "#core/mail-actions.ts";
import { messageUrl } from "#core/notifications.ts";
import type { State } from "#core/state.ts";

import type { Focus } from "./focus.ts";
import type { MailPoller } from "./mail.ts";
import { profileDisplayName } from "./profile-copy.ts";

export interface InboxDeps {
  mail: Pick<MailPoller, "mail" | "entries">;
  /** Runs an action through the profile's session; never rejects. */
  run: (
    profileId: string,
    action: MailAction,
    messageId: string
  ) => Promise<ActionOutcome>;
  /** Shows `url` in the profile's Gmail tab and selects the profile. */
  open: (profileId: string, url: string) => Promise<void>;
  /** Gmail's inbox, which a message opens at when its link is not Gmail's. */
  inbox: string;
  /** Main's state when the inbox starts following it. */
  initial: State;
  focus: Pick<Focus, "focus">;
  closeOverlay: () => void;
  now?: () => number;
  log: (message: string) => void;
}

type Notice = ShellState["inbox"]["notice"];

const CLOSED: ShellState["inbox"] = {
  open: false,
  profiles: [],
  rows: [],
  notice: null,
};

/** The inbox is for more than one profile, as v3's is. */
const inboxAvailable = (state: State) => state.profiles.length > 1;

/**
 * The unified inbox: whether it covers the content area, the rows it shows,
 * and the actions started from it. A row an action is running on, or has
 * just run on, is hidden until a poll that started after the action ended
 * says what the feed lists; one whose action failed comes back with a
 * notice. Only listed messages of a profile whose feed reads can be opened
 * or acted on, whatever the shell asks.
 */
export const createInbox = ({
  mail,
  run,
  open,
  inbox,
  initial,
  focus,
  closeOverlay,
  now = Date.now,
  log,
}: InboxDeps) => {
  const listeners = new Set<() => void>();
  let state = initial;
  let isOpen = false;
  let notice: Notice = null;
  let pending = new Map<string, PendingAction>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const close = () => {
    if (!isOpen) {
      return;
    }

    isOpen = false;
    notice = null;
    notify();
    focus.focus([{ kind: "front" }, { kind: "shell" }]);
  };

  /** The entry, if the profile's feed reads and lists the message. */
  const listed = (profileId: string, messageId: string) =>
    state.profiles.some((profile) => profile.id === profileId) &&
    mail.mail(profileId).status === "ok"
      ? mail.entries(profileId).find((entry) => entry.id === messageId)
      : undefined;

  return {
    isOpen: () => isOpen,
    setOpen: (next: boolean) => {
      if (!next) {
        close();

        return;
      }

      if (isOpen) {
        return;
      }

      if (!inboxAvailable(state)) {
        log("Refused to open the unified inbox with only one profile");

        return;
      }

      closeOverlay();
      isOpen = true;
      notice = null;
      notify();
      focus.focus([{ kind: "shell" }]);
    },
    /** The shell's `inbox` slice; nothing of any mail while it is closed. */
    shellSlice: (): ShellState["inbox"] => {
      if (!isOpen) {
        return CLOSED;
      }

      const profiles = state.profiles.map((profile) => {
        const { status, unreadCount } = mail.mail(profile.id);

        return {
          id: profile.id,
          name: profileDisplayName(profile),
          status,
          unreadCount,
          listed: status === "ok" ? mail.entries(profile.id).length : 0,
        };
      });

      return {
        open: true,
        profiles,
        rows: inboxRows(
          profiles
            .filter((profile) => profile.status === "ok")
            .map((profile) => ({
              id: profile.id,
              entries: mail.entries(profile.id),
            })),
          new Set(pending.keys())
        ),
        notice,
      };
    },
    openMessage: async (profileId: string, messageId: string) => {
      const entry = isOpen ? listed(profileId, messageId) : undefined;

      if (!entry) {
        log(
          `Refused to open a message the inbox does not list, of profile ${profileId}`
        );

        return;
      }

      // Which closes the inbox, as every request to show a profile does.
      await open(profileId, messageUrl(entry.link, inbox));
    },
    runAction: async (
      profileId: string,
      messageId: string,
      action: MailAction
    ) => {
      const key = inboxKey(profileId, messageId);

      if (!isOpen || pending.has(key) || !listed(profileId, messageId)) {
        log(
          `Refused ${action} on a message the inbox does not offer, of profile ${profileId}`
        );

        return;
      }

      pending.set(key, { phase: "running", profileId });
      notice = null;
      notify();

      const outcome = await run(profileId, action, messageId);

      // Its profile was removed meanwhile.
      if (!pending.has(key)) {
        return;
      }

      if (outcome.kind === "ok") {
        pending.set(key, { phase: "done", profileId, at: now() });

        return;
      }

      pending.delete(key);

      // A failure that lands after a close is not told on the next open.
      if (isOpen) {
        notice = {
          action,
          profileId,
          reason: outcome.kind === "signedOut" ? "signedOut" : "failed",
        };
      }

      notify();
    },
    /** Told as each poll ends, which may confirm or give back hidden rows. */
    polled: (profileId: string, outcome: FeedOutcome, startedAt: number) => {
      if (outcome.kind !== "failed") {
        pending = afterPoll(
          pending,
          profileId,
          startedAt,
          new Set(
            outcome.kind === "feed"
              ? outcome.feed.entries.map((entry) => entry.id)
              : []
          )
        );
      }

      if (isOpen) {
        notify();
      }
    },
    /**
     * Told of each change of main's state: one profile left closes it, and a
     * removed profile's actions are forgotten. Selecting is not followed:
     * each request that selects closes it itself, the selection unchanged
     * included.
     */
    follow: (next: State) => {
      const ids = new Set(next.profiles.map((profile) => profile.id));

      state = next;
      pending = new Map(
        [...pending].filter(([, action]) => ids.has(action.profileId))
      );

      if (notice && !ids.has(notice.profileId)) {
        notice = null;
      }

      if (!inboxAvailable(next)) {
        close();
      } else if (isOpen) {
        notify();
      }
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type Inbox = ReturnType<typeof createInbox>;
