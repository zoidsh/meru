import type { App } from "../records/app.ts";
import { isSingleInstance } from "../records/app.ts";

/** The apps of `appIds` the catalog knows, in that order, whose name holds `query`, less the single-instance apps, whose one tab a profile always has open. */
export const launcherApps = (
  catalog: readonly App[],
  appIds: readonly string[],
  query: string
): App[] => {
  const wanted = query.trim().toLocaleLowerCase();
  return appIds.flatMap((id) => {
    const app = catalog.find((found) => found.id === id);
    return app !== undefined &&
      !isSingleInstance(app) &&
      app.name.toLocaleLowerCase().includes(wanted)
      ? [app]
      : [];
  });
};
