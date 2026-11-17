import { Notification } from "electron";

import { escapeNotificationMarkup } from "#core/notifications.ts";

/** Plain text, which the system shows as text. */
export interface NotificationContent {
  title: string;
  /** Shown on macOS alone. */
  subtitle?: string;
  body: string;
}

export interface NotificationEvents {
  onClick: () => void;
  /** Once, as it is clicked, closed or fails, after which nothing comes of it. */
  onGone: () => void;
}

export interface ShownNotification {
  close: () => void;
}

export interface Notifier {
  /** Nothing where the system has no notifications. */
  show: (
    content: NotificationContent,
    events: NotificationEvents
  ) => ShownNotification | undefined;
}

/**
 * At most this many are held at once, the oldest closed past it, so ones the
 * system never reports closed cannot pile up.
 */
const MOST_HELD = 100;

/**
 * Holds each shown notification until it is clicked, closed or fails, since
 * Electron holds them weakly and one collected early loses its click.
 */
const createHolder = <Held>(closeHeld: (held: Held) => void) => {
  const held = new Map<Held, () => void>();

  const release = (notification: Held) => {
    const gone = held.get(notification);

    if (gone) {
      held.delete(notification);
      gone();
    }
  };

  return {
    hold: (notification: Held, onGone: () => void) => {
      held.set(notification, onGone);

      for (const oldest of held.keys()) {
        if (held.size <= MOST_HELD) {
          break;
        }

        release(oldest);
        closeHeld(oldest);
      }
    },
    release,
  };
};

export const createNotifier = (): Notifier => {
  const holder = createHolder<Notification>((notification) => {
    notification.close();
  });

  return {
    show: (content, { onClick, onGone }) => {
      if (!Notification.isSupported()) {
        return;
      }

      // Only Linux's servers read a body as markup.
      const notification = new Notification(
        process.platform === "linux"
          ? { ...content, body: escapeNotificationMarkup(content.body) }
          : content
      );

      notification.once("click", () => {
        holder.release(notification);
        onClick();
      });
      notification.once("close", () => {
        holder.release(notification);
      });
      notification.once("failed", () => {
        holder.release(notification);
      });
      holder.hold(notification, onGone);
      notification.show();

      return {
        close: () => {
          holder.release(notification);
          notification.close();
        },
      };
    },
  };
};

/** One the end-to-end build has captured in place of showing it. */
interface CapturedNotification extends NotificationContent {
  /** Whether it is still where the system would show it. */
  shown: boolean;
  click: () => void;
}

/**
 * The end-to-end build's notifier, which never puts one on the desktop. Each
 * is kept on the main process's global under `meruTestNotifications`, where
 * a test reads and clicks it.
 */
export const createCapturedNotifier = (): Notifier => {
  const captured: CapturedNotification[] = [];
  const holder = createHolder<CapturedNotification>((notification) => {
    notification.shown = false;
  });

  Reflect.set(globalThis, "meruTestNotifications", captured);

  return {
    show: (content, { onClick, onGone }) => {
      const notification: CapturedNotification = {
        ...content,
        shown: true,
        click: () => {
          if (notification.shown) {
            notification.shown = false;
            holder.release(notification);
            onClick();
          }
        },
      };

      captured.push(notification);
      holder.hold(notification, onGone);

      return {
        close: () => {
          notification.shown = false;
          holder.release(notification);
        },
      };
    },
  };
};
