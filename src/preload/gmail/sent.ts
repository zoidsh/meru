import type { SentNotice } from "#contract/gmail-channels.ts";
import { VIEW_ANCHORS, findHook, guardedSelector } from "#core/gmail-hooks.ts";

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
  /** Runs `look` once the page has had time to draw what follows the notice. */
  afterGone: (look: () => void) => void;
}

/**
 * Tells of Gmail's sent notice as it appears and as it goes, looking once per
 * frame of changes rather than at every mutation. As it goes, it waits for
 * the page to settle and tells whether a compose is there, since Gmail's own
 * Undo takes the bar away as it brings the draft back. Returns what stops it.
 */
export const watchSentNotice = (
  { root, isVisible, beforePaint, afterGone }: SentWatchPage,
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

    if (now === shown) {
      return;
    }

    shown = now;

    if (now) {
      tell("shown");

      return;
    }

    afterGone(() => {
      if (!stopped && !shown) {
        tell(root.querySelector(VIEW_ANCHORS.compose) ? "undone" : "gone");
      }
    });
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

const SENT_UNDO = findHook("sentUndo");

/**
 * Presses the Undo of Gmail's "Message sent" bar, never a link quoted in
 * mail; whether there was one to press.
 */
export const undoSent = (root: ParentNode) => {
  const undo = SENT_UNDO.anchors
    .map((anchor) =>
      root.querySelector<HTMLElement>(guardedSelector(SENT_UNDO, anchor))
    )
    .find((element) => element !== null);

  undo?.click();

  return undo !== undefined;
};
