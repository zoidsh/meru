import { DisposableStore } from "../../../core/disposable.ts";
import {
  mailNotice,
  MAX_MAIL_NOTICES,
  messageUrl,
  notifiable,
} from "../../../core/engines/notifications.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { NotificationPort } from "../../../core/ports.ts";
import type { FeedEntry } from "../../../core/records/feed.ts";
import type { Platform } from "../../../core/records/platform.ts";
import { gmail } from "../../../shared/apps.ts";
import { msg } from "../../../shared/msg.ts";
import type { Inbox } from "../inbox/index.ts";
import type { Profiles } from "../profiles/index.ts";
import type { SettingsStore } from "../settings/index.ts";

export interface NotificationsOptions {
  readonly notifications: NotificationPort;
  readonly platform: Platform;
  readonly inbox: Pick<Inbox, "important">;
  readonly profiles: Pick<Profiles, "state" | "focusTab">;
  readonly settings: Pick<SettingsStore, "get">;
  readonly events: Pick<AppEvents, "on">;
  /** Brings the main window to the front. */
  readonly showWindow: () => void;
  /** Loads an address into the tab's pane, or the view it is next given. */
  readonly load: (tabId: string, url: string) => void;
  /** The mailbox a message opens in, which a run from the repository may point at a stand-in. */
  readonly gmailUrl: string;
}

/** Raises a notification for each new email a profile's feed brings, or one for the lot past a handful, under that profile's notification settings, and opens the message, or the inbox, when one is clicked. */
export class Notifications {
  readonly #options: NotificationsOptions;
  readonly #disposables = new DisposableStore();

  constructor(options: NotificationsOptions) {
    this.#options = options;
  }

  start(): void {
    this.#disposables.add(
      this.#options.events.on("mail.arrived", ({ profileId, entries }) => {
        void this.#notify(profileId, entries);
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  async #notify(
    profileId: string,
    arrived: readonly FeedEntry[]
  ): Promise<void> {
    const { gmailUrl, inbox, notifications, platform, profiles, settings } =
      this.#options;
    if (!settings.get("notifications.enabled", profileId)) {
      return;
    }
    const newEmails = settings.get("notifications.newEmails", profileId);
    // The Important feed costs a request, so it is read only once there is mail to filter.
    const important =
      newEmails === "important" ? await inbox.important(profileId) : undefined;
    const profile = profiles.state.profiles.find(
      (found) => found.id === profileId
    );
    if (profile === undefined) {
      return;
    }
    const options = {
      labelled: profiles.state.profiles.length > 1,
      platform,
      profileLabel: profile.label,
      showSender: settings.get("notifications.showSender"),
      showSubject: settings.get("notifications.showSubject"),
      showSummary: settings.get("notifications.showSummary"),
    };
    const silent = !settings.get("notifications.playSound");
    const notified = notifiable(arrived, newEmails, important);
    if (notified.length > MAX_MAIL_NOTICES) {
      const count = msg`${notified.length} new emails`;
      notifications.show(
        {
          silent,
          title: options.labelled ? `[${profile.label}] ${count}` : count,
        },
        () => {
          this.#open(profileId, `${gmailUrl}/#inbox`);
        }
      );
      return;
    }
    for (const entry of notified) {
      notifications.show({ ...mailNotice(entry, options), silent }, () => {
        this.#open(
          profileId,
          entry.messageId === ""
            ? undefined
            : messageUrl(gmailUrl, entry.messageId)
        );
      });
    }
  }

  /** Brings the profile's Gmail tab to the front, at `url` when given. */
  #open(profileId: string, url?: string): void {
    const { load, profiles, showWindow } = this.#options;
    showWindow();
    const tab = profiles.state.tabs.find(
      (found) => found.profileId === profileId && found.appId === gmail.id
    );
    if (tab === undefined) {
      return;
    }
    if (url !== undefined) {
      load(tab.id, url);
    }
    profiles.focusTab(tab.id);
  }
}
