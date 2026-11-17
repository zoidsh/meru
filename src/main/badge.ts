import { plural, t } from "@lingui/core/macro";

import { drawUnreadBadge } from "#core/badge-image.ts";
import type { Platform } from "#core/platform.ts";
import { MAX_SHOWN_UNREAD } from "#core/unread.ts";
import type { Badge } from "#platform/badge.ts";

/** Windows' overlay is 16 logical pixels; the second is for a 200% display. */
const OVERLAY_SIZES = [16, 32];

/** A count as a badge or a menu shows it, capped as the title bar's is. */
export const unreadText = (count: number) =>
  count > MAX_SHOWN_UNREAD
    ? t({
        message: `${MAX_SHOWN_UNREAD}+`,
        comment:
          "Shown on an unread badge when more messages are unread than the number before the plus",
      })
    : String(count);

export interface UnreadBadgeDeps {
  badge: Badge;
  platform: Platform;
  /** Read at each update, so turning it off clears the badge at once. */
  enabled: () => boolean;
  total: () => number;
}

/** Shows the total unread count on the app's icon, and nothing at zero. */
export const createUnreadBadge = ({
  badge,
  platform,
  enabled,
  total,
}: UnreadBadgeDeps) => {
  let shownCount = 0;
  let closed = false;

  return {
    /** Called whenever the count or the setting may have changed. */
    update: () => {
      if (closed) {
        return;
      }

      const count = enabled() ? total() : 0;

      if (count === shownCount) {
        return;
      }

      shownCount = count;
      badge.show(
        count > 0
          ? {
              count,
              text: unreadText(count),
              overlay:
                platform === "win32"
                  ? OVERLAY_SIZES.map((size) => drawUnreadBadge(count, size))
                  : [],
              description: t({
                message: plural(count, {
                  one: "# unread message",
                  other: "# unread messages",
                }),
                comment:
                  "Read out by a screen reader for the unread badge on Meru's taskbar button on Windows",
              }),
            }
          : undefined
      );
    },
    /**
     * On quit: clears the badge for good, so no late poll sets it again and
     * none is left on a launcher that keeps it.
     */
    close: () => {
      closed = true;
      shownCount = 0;
      badge.show(undefined);
    },
  };
};
