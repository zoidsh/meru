import { OVERLAY_FRAME_NAME, staysOpenOutside } from "#core/overlay.ts";
import { ownWindowFindOfFrame, ownWindowOfFrame } from "#core/own-window.ts";
import { tabKey } from "#core/tabs.ts";

import type { createApplicationMenu } from "../application-menu.ts";
import type { Focus } from "../focus.ts";
import type { Overlays } from "../overlay.ts";
import type { OwnWindows } from "../own-windows.ts";
import type { SenderRegistry } from "../senders.ts";
import type { createShellWindow } from "../shell-window.ts";

/**
 * The documents the shell opens beside its page: the overlay, and each own
 * window's titlebar and find bar, each adopted where it belongs.
 */
export const wireShellDocuments = ({
  shell,
  senders,
  focus,
  overlays,
  ownWindows,
  handleKey,
}: {
  shell: ReturnType<typeof createShellWindow>;
  senders: SenderRegistry;
  focus: Focus;
  overlays: Overlays;
  ownWindows: OwnWindows;
  handleKey: ReturnType<typeof createApplicationMenu>["handleKey"];
}) => {
  /** Tabs in their own windows whose find bar's view, still to come, takes focus. */
  const barsAwaited = new Set<string>();

  /** The web contents of the shell's documents open now, which never zoom. */
  const shellDocumentIds = new Set<number>();

  shell.window.onShellDocument((view, frameName) => {
    const id = view.webContentsId;

    shellDocumentIds.add(id);
    view.onGone(() => shellDocumentIds.delete(id));
    // None has a bridge of its own; the shell draws into each.
    view.onGone(senders.register(view.webContentsId, { role: "overlay" }));
    view.onKey((input) => handleKey(input));

    const findWindow = ownWindowFindOfFrame(frameName);

    if (findWindow) {
      // Keys there act on that window's tab, as in its page.
      view.onFocus(() => {
        focus.noteFocused({ kind: "window", key: findWindow });
      });
      ownWindows.adoptFind(findWindow, view);

      if (barsAwaited.delete(tabKey(findWindow))) {
        focus.focusInWindow(findWindow, [
          { kind: "windowFind", key: findWindow },
        ]);
      }

      return;
    }

    const ownWindow = ownWindowOfFrame(frameName);

    if (ownWindow) {
      view.onFocus(() => {
        focus.noteFocused({ kind: "window", key: ownWindow });
      });
      ownWindows.adoptTitlebar(ownWindow, view);

      return;
    }

    if (frameName !== OVERLAY_FRAME_NAME) {
      view.close();

      return;
    }

    view.onFocus(() => {
      focus.noteFocused({ kind: "overlay" });
    });
    overlays.adopt(view);
  });
  shell.window.onPageFocus(() => {
    focus.noteFocused({ kind: "shell" });
  });
  shell.window.on("blur", () => {
    if (!staysOpenOutside(overlays.current())) {
      overlays.close();
    }
  });
  shell.window.onContentAreaResize(overlays.relayout);

  return { shellDocumentIds, barsAwaited };
};
