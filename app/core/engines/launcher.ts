import type { App } from "../records/app.ts";
import type { Rect } from "../records/rect.ts";
import { TITLEBAR_HEIGHT } from "./chrome.ts";

/** The apps of `appIds` the catalog knows, in that order, whose name holds `query`. */
export const launcherApps = (
  catalog: readonly App[],
  appIds: readonly string[],
  query: string
): App[] => {
  const wanted = query.trim().toLocaleLowerCase();
  return appIds.flatMap((id) => {
    const app = catalog.find((found) => found.id === id);
    return app !== undefined && app.name.toLocaleLowerCase().includes(wanted)
      ? [app]
      : [];
  });
};

/** Which side of its button the launcher opens on: below one in the titlebar, to the right of one at the sidebar's foot. */
export const launcherSide = (anchor: Rect): "bottom" | "right" =>
  anchor.y >= TITLEBAR_HEIGHT ? "right" : "bottom";
