import type { SentNotice } from "#contract/gmail-channels.ts";
import { findHook, guardedSelector } from "#core/gmail-hooks.ts";

const SENT_NOTICE = findHook("sentNotice");

/** Whether Gmail's "Message sent" bar shows, never one quoted in mail. */
export const sentNoticeShown = (
  root: ParentNode,
  isVisible: (element: Element) => boolean
) =>
  SENT_NOTICE.anchors.some((anchor) =>
    [...root.querySelectorAll(guardedSelector(SENT_NOTICE, anchor))].some(
      isVisible
    )
  );

export interface SentWatchPage {
  root: Document;
  isVisible: (element: Element) => boolean;
  /** Runs `check` once before the next paint; many asks before it run it once. */
  beforePaint: (check: () => void) => void;
}

/**
 * Tells of Gmail's sent notice as it appears and as it goes, looking once per
 * frame of changes rather than at every mutation. Returns what stops it.
 */
export const watchSentNotice = (
  { root, isVisible, beforePaint }: SentWatchPage,
  tell: (notice: SentNotice) => void
) => {
  let shown = false;
  let asked = false;
  let stopped = false;

  const check = () => {
    asked = false;

    if (stopped) {
      return;
    }

    const now = sentNoticeShown(root, isVisible);

    if (now !== shown) {
      shown = now;
      tell(now ? "shown" : "gone");
    }
  };

  const observer = new MutationObserver(() => {
    if (!asked) {
      asked = true;
      beforePaint(check);
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });
  check();

  return () => {
    stopped = true;
    observer.disconnect();
  };
};
