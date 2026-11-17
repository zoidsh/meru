import { useLingui } from "@lingui/react/macro";
import { cn } from "cn";

import { MAX_SHOWN_UNREAD } from "#core/unread.ts";
import { Badge } from "#ui/badge.tsx";

/** How many messages are unread, for the eye alone; nothing for none. */
export const UnreadBadge = ({
  count,
  className,
}: {
  count: number;
  className?: string;
}) => {
  const { t } = useLingui();

  if (count <= 0) {
    return null;
  }

  return (
    <Badge aria-hidden className={cn("h-4 px-1.5 tabular-nums", className)}>
      {count > MAX_SHOWN_UNREAD
        ? t({
            message: `${MAX_SHOWN_UNREAD}+`,
            comment:
              "Shown on an unread badge, on a profile's tab in the title bar or on Gmail's tab, when more messages are unread than the number before the plus",
          })
        : count}
    </Badge>
  );
};
