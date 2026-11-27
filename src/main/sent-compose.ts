import type { SentNotice } from "#contract/gmail-channels.ts";
import type { Overlay } from "#core/overlay.ts";
import type { SentWindows } from "#platform/sent-windows.ts";

import type { Overlays } from "./overlay.ts";

/**
 * The longest a sent compose window waits hidden: Gmail's longest undo
 * period, 30 s, and a margin for its notice to go. v3 closed it at 30 s.
 */
export const SENT_WINDOW_BOUND_MS = 35_000;

interface Waiting {
  /** Gmail's notice has gone, so its Undo has too: the send is final. */
  gone: boolean;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Close compose window after sending: a compose window whose send Gmail
 * shows is hidden at once, and the main window says so with Undo. Undo
 * presses Gmail's own Undo in that page and shows the window again; without
 * it the window closes once Gmail's notice has gone and the toast has ended,
 * whichever is later, or at the bound. Until then the page lives, since it
 * is the page that holds the send through Gmail's undo period. A quit waits
 * for none: a send still in that period when Meru quits may be lost.
 */
export const createSentCompose = ({
  enabled,
  windows,
  overlays,
  undoPage,
}: {
  enabled: () => boolean;
  windows: SentWindows;
  overlays: Pick<Overlays, "open" | "close" | "current" | "onChange">;
  /** Presses Gmail's Undo in the window's page. */
  undoPage: (webContentsId: number) => void;
}) => {
  const waiting = new Map<number, Waiting>();
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

  const shown = (webContentsId: number) => {
    if (!enabled() || waiting.has(webContentsId)) {
      return;
    }

    windows.hide(webContentsId);
    waiting.set(webContentsId, {
      gone: false,
      timer: setTimeout(() => {
        close(webContentsId);
      }, SENT_WINDOW_BOUND_MS),
    });
    windows.onClosed(webContentsId, () => {
      forget(webContentsId);
    });

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

  return {
    /** What a compose window's page told of Gmail's sent notice. */
    notice: (webContentsId: number, notice: SentNotice) => {
      if (notice === "shown") {
        shown(webContentsId);
      } else {
        gone(webContentsId);
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
      windows.show(webContentsId);
    },
  };
};

export type SentCompose = ReturnType<typeof createSentCompose>;
