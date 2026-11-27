import type { SentNotice } from "#contract/gmail-channels.ts";
import { VIEW_ANCHORS, findHook, guardedSelector } from "#core/gmail-hooks.ts";

const SENT_NOTICE = findHook("sentNotice");
const SENT_UNDO = findHook("sentUndo");
const SENT_UNDO_SELECTORS = SENT_UNDO.anchors.map((anchor) =>
  guardedSelector(SENT_UNDO, anchor)
);

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
 * frame of changes rather than at every mutation. A press of the bar's own
 * Undo tells `undone` at once, before Gmail takes the bar away and long
 * before its round trip brings the draft back. Gmail's keyboard Undo presses
 * nothing, so as the bar goes otherwise it waits a while and tells `undone`
 * if a compose is there by then; a slower round trip still reads as `gone`,
 * closing the window, and the draft is then in Gmail's Drafts. Returns what
 * stops it.
 */
export const watchSentNotice = (
  { root, isVisible, beforePaint, afterGone }: SentWatchPage,
  tell: (notice: SentNotice) => void
) => {
  let shown = false;
  let asked = false;
  let stopped = false;
  // The bar's own Undo was pressed, so its going is told already.
  let pressedUndo = false;

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
      pressedUndo = false;
      tell("shown");

      return;
    }

    if (pressedUndo) {
      pressedUndo = false;

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

  const onPress = (event: Event) => {
    const target = event.target as Partial<Element> | null;

    if (
      shown &&
      !pressedUndo &&
      SENT_UNDO_SELECTORS.some((selector) => target?.closest?.(selector))
    ) {
      pressedUndo = true;
      tell("undone");
    }
  };

  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });
  // Captured, so Gmail's own handler cannot stop it first.
  root.addEventListener("click", onPress, { capture: true, passive: true });
  check();

  return () => {
    stopped = true;
    observer.disconnect();
    root.removeEventListener("click", onPress, { capture: true });
  };
};

/**
 * Presses the Undo of Gmail's "Message sent" bar, never a link quoted in
 * mail; whether there was one to press.
 */
export const undoSent = (root: ParentNode) => {
  const undo = SENT_UNDO_SELECTORS.map((selector) =>
    root.querySelector<HTMLElement>(selector)
  ).find((element) => element !== null);

  undo?.click();

  return undo !== undefined;
};
