import type { App } from "../records/app.ts";

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
