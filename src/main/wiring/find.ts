import { isEqual } from "es-toolkit";

import { tabKey } from "#core/tabs.ts";

import { createFind } from "../find.ts";
import type { Focus } from "../focus.ts";
import type { Overlays } from "../overlay.ts";
import type { OwnWindows } from "../own-windows.ts";
import type { createTabViews } from "../tab-views.ts";

/**
 * Find in page, its bar over the main window's page or in a tab's own
 * window, placed on its pane as the split moves.
 */
export const wireFind = ({
  views,
  overlays,
  focus,
  ownWindows,
  barsAwaited,
}: {
  views: ReturnType<typeof createTabViews>;
  overlays: Overlays;
  focus: Focus;
  ownWindows: OwnWindows;
  barsAwaited: Set<string>;
}) => {
  const find = createFind({
    pages: views,
    overlays,
    focus,
    windows: {
      focusBar: (key) => {
        if (ownWindows.findFocuser(key)) {
          focus.focusInWindow(key, [{ kind: "windowFind", key }]);
        } else {
          barsAwaited.add(tabKey(key));
        }
      },
      focusPage: (key) => {
        barsAwaited.delete(tabKey(key));
        focus.focusInWindow(key, [{ kind: "window", key }]);
      },
    },
  });

  overlays.onChange(find.follow);
  views.onChange(find.follow);

  // The find bar sits on its pane, which moves with the split; the views
  // also change on every page event, which must not move it.
  let panesLaidOut = views.panes();

  views.onChange(() => {
    const panes = views.panes();

    if (!isEqual(panes, panesLaidOut)) {
      panesLaidOut = panes;
      overlays.relayout();
    }
  });

  return find;
};
