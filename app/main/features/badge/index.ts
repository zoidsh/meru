import { DisposableStore } from "../../../core/disposable.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { BadgePort } from "../../../core/ports.ts";
import type { Inbox } from "../inbox/index.ts";
import type { SettingsStore } from "../settings/index.ts";

interface BadgeOptions {
  readonly badge: BadgePort;
  readonly inbox: Pick<Inbox, "total">;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly events: Pick<AppEvents, "on">;
}

const BADGE_KEYS = new Set(["inbox.unreadBadge", "inbox.countUnread"]);

/** The unread badge: the unread mail of every counted profile on the app's icon, while `inbox.unreadBadge` is on. */
export class Badge {
  readonly #options: BadgeOptions;
  readonly #disposables = new DisposableStore();

  constructor(options: BadgeOptions) {
    this.#options = options;
  }

  start(): void {
    const { badge, events, settings } = this.#options;
    this.#disposables.add(
      events.on("inbox.changed", () => {
        this.#show();
      }),
      settings.subscribe((changes) => {
        if (changes.some((change) => BADGE_KEYS.has(change.key))) {
          this.#show();
        }
      }),
      () => {
        badge.set(0);
      }
    );
    this.#show();
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  #show(): void {
    const { badge, inbox, settings } = this.#options;
    badge.set(settings.get("inbox.unreadBadge") ? inbox.total() : 0);
  }
}
