import { useLingui } from "@lingui/react/macro";
import { BookmarkIcon } from "lucide-react";

import { shellCalls, useShellState } from "./sync.ts";
import { TitlebarButton } from "./titlebar-button.tsx";

/**
 * The star of a tab's own window, first of its titlebar's right-hand group:
 * Bookmark Tab, or Remove Bookmark while filled; none while its page cannot
 * be bookmarked.
 */
export const OwnWindowBookmarkButton = ({
  profileId,
  tabId,
  bookmarked,
}: {
  profileId: string;
  tabId: string;
  bookmarked: boolean | null;
}) => {
  const { t } = useLingui();
  const shortcut = useShellState("shortcuts")?.["tab.bookmark"];

  if (bookmarked === null) {
    return null;
  }

  return (
    <TitlebarButton
      label={
        bookmarked
          ? t({
              message: "Remove bookmark",
              context: "button",
              comment:
                "Accessible name and tooltip of the filled bookmark button in the title bar of a tab's own window, which removes its page's bookmark",
            })
          : t({
              message: "Bookmark tab",
              context: "button",
              comment:
                "Accessible name and tooltip of the bookmark button in the title bar of a tab's own window, which saves its page as a bookmark",
            })
      }
      shortcut={shortcut}
      onClick={() => {
        shellCalls().toggleTabBookmark({ profileId, tabId });
      }}
    >
      <BookmarkIcon className={bookmarked ? "fill-current" : undefined} />
    </TitlebarButton>
  );
};
