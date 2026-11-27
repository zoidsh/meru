import type { SentNotice } from "#contract/gmail-channels.ts";
import { leavesViewFree } from "#core/overlay.ts";
import type { Overlay } from "#core/overlay.ts";
import type { SentWindows } from "#platform/sent-windows.ts";

import type { Overlays } from "./overlay.ts";

/**
 * The longest a sent compose window waits: Gmail's longest undo period,
 * 30 s, and a margin for its notice to go. v3 closed it at 30 s.
 */
export const SENT_WINDOW_BOUND_MS = 35_000;

interface Waiting {
  /** Taken off screen, its Undo on the main window's toast. */
  hidden: boolean;
  /** Gmail's notice has gone, so its Undo has too: the send is final. */
  gone: boolean;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Close compose window after sending. A compose window whose send Gmail
 * shows is hidden at once while the main window can say so with Undo: shown,
 * not minimized, and nothing open in its overlay that a toast would replace,
 * as the other toasts decide. Undo presses Gmail's own Undo in that page and
 * shows the window again. Otherwise the window stays as Gmail leaves it,
 * Gmail's own Undo in view. Either way it closes once Gmail's notice has gone
 * and its toast has ended, whichever is later, or at the bound if hidden;
 * Gmail's own Undo pressed in a window in view leaves the window be, as
 * does the bound. Until then the page lives, since it holds the send through
 * Gmail's undo period. A quit waits for none: a send still in that period
 * when Meru quits may be lost.
 */
export const createSentCompose = ({
  enabled,
  windows,
  overlays,
  mainWindowShown,
  undoPage,
  released,
}: {
  enabled: () => boolean;
  windows: SentWindows;
  overlays: Pick<
    Overlays,
    "open" | "close" | "current" | "onChange" | "webContentsId"
  >;
  /** Whether the main window is on screen: shown and not minimized. */
  mainWindowShown: () => boolean;
  /** Presses Gmail's Undo in the window's page. */
  undoPage: (webContentsId: number) => void;
  /** Told as a window stops waiting, which its page's watch may follow. */
  released: (webContentsId: number) => void;
}) => {
  const waiting = new Map<number, Waiting>();
  const listening = new Set<number>();
  // The window the open toast is about, and the toast itself.
  let toast: { webContentsId: number; overlay: Overlay } | undefined;
  // The window the latest toast was about, which its Undo takes back: the
  // press on it closes the toast before the shell's call arrives.
  let latest: number | undefined;

  const toastOpenFor = (webContentsId: number) =>
    toast?.webContentsId === webContentsId &&
    overlays.current() === toast.overlay;

  const forget = (webContentsId: number) => {
    const entry = waiting.get(webContentsId);

    if (!entry) {
      return;
    }

    clearTimeout(entry.timer);
    waiting.delete(webContentsId);

    if (latest === webContentsId) {
      latest = undefined;
    }

    if (toastOpenFor(webContentsId)) {
      overlays.close();
    }

    released(webContentsId);
  };

  /** Shows a hidden window again, its page's timers kept as any other's. */
  const bringBack = (webContentsId: number) => {
    windows.setThrottling(webContentsId, true);
    windows.show(webContentsId);
  };

  const close = (webContentsId: number) => {
    forget(webContentsId);
    windows.destroy(webContentsId);
  };

  const closeIfDone = (webContentsId: number) => {
    if (waiting.get(webContentsId)?.gone && !toastOpenFor(webContentsId)) {
      close(webContentsId);
    }
  };

  overlays.onChange(() => {
    if (toast && overlays.current() !== toast.overlay) {
      const { webContentsId } = toast;

      toast = undefined;
      closeIfDone(webContentsId);
    }
  });

  /** Whether a toast would show now, replacing nothing but another toast. */
  const toastShows = () => {
    const open = overlays.current();

    return (
      mainWindowShown() &&
      overlays.webContentsId() !== undefined &&
      (leavesViewFree(open) || open?.kind === "toast")
    );
  };

  const shown = (webContentsId: number) => {
    if (!enabled() || waiting.has(webContentsId)) {
      return;
    }

    const hidden = toastShows();

    waiting.set(webContentsId, {
      hidden,
      gone: false,
      // A window in view cannot be lost, and may be where a person writes
      // their next email, so the bound only lets it go.
      timer: setTimeout(() => {
        if (hidden) {
          close(webContentsId);
        } else {
          forget(webContentsId);
        }
      }, SENT_WINDOW_BOUND_MS),
    });

    if (!listening.has(webContentsId)) {
      listening.add(webContentsId);
      windows.onClosed(webContentsId, () => {
        listening.delete(webContentsId);
        forget(webContentsId);
      });
    }

    if (!hidden) {
      return;
    }

    // A hidden page's timers would run late: Gmail's send at the end of its
    // undo period, and the watch that tells of its notice going.
    windows.setThrottling(webContentsId, false);
    windows.hide(webContentsId);

    // An earlier send's toast is closed first, since the overlays keep an
    // equal one open as it is, and this send's Undo gets a toast's full time.
    if (toast && toastOpenFor(toast.webContentsId)) {
      overlays.close();
    }

    const overlay: Overlay = { kind: "toast", message: "message-sent" };

    toast = { webContentsId, overlay };
    latest = webContentsId;
    overlays.open(overlay);
  };

  const gone = (webContentsId: number) => {
    const entry = waiting.get(webContentsId);

    if (!entry) {
      return;
    }

    entry.gone = true;

    if (latest === webContentsId) {
      latest = undefined;
    }

    // Its Undo has gone with it, so the toast offers none it cannot keep.
    if (toastOpenFor(webContentsId)) {
      overlays.close();
    }

    closeIfDone(webContentsId);
  };

  const undone = (webContentsId: number) => {
    const entry = waiting.get(webContentsId);

    if (!entry) {
      return;
    }

    // Nobody presses Gmail's Undo in a hidden page, so a compose left there,
    // a docked draft or an inline reply, says nothing of this send.
    if (entry.hidden) {
      gone(webContentsId);
    } else {
      forget(webContentsId);
    }
  };

  return {
    /** What a compose window's page told of Gmail's sent notice. */
    notice: (webContentsId: number, notice: SentNotice) => {
      switch (notice) {
        case "shown": {
          shown(webContentsId);
          break;
        }
        case "gone": {
          gone(webContentsId);
          break;
        }
        default: {
          undone(webContentsId);
        }
      }
    },
    /** Undo on the toast: the send taken back, the window shown again. */
    undo: () => {
      const webContentsId = latest;

      if (webContentsId === undefined) {
        return;
      }

      forget(webContentsId);
      undoPage(webContentsId);
      bringBack(webContentsId);
    },
    /** Whether the window waits on its send, whose watch must go on. */
    waits: (webContentsId: number) => waiting.has(webContentsId),
  };
};

export type SentCompose = ReturnType<typeof createSentCompose>;
