import { readFileSync } from "node:fs";
import path from "node:path";

import { readBranch, userDataDirFor } from "@meru/user-data";
import { app } from "electron";

/** The checkout a `pnpm package` build names in its `local-package` resource; undefined for a CI or release build, which has none. */
const markerRepo = (): string | undefined => {
  try {
    const repo = readFileSync(
      path.join(process.resourcesPath, "local-package"),
      "utf-8"
    ).trim();
    return repo === "" ? undefined : repo;
  } catch {
    return undefined;
  }
};

/** Electron reads the user data path for Chromium's profile at ready, so this runs before it. */
export const placeUserData = (root: string): void => {
  const packaged = app.isPackaged;
  const explicit = app.commandLine.getSwitchValue("user-data-dir");
  const dir = userDataDirFor({
    branch: packaged ? undefined : readBranch(root),
    explicitDir: explicit === "" ? undefined : explicit,
    markerRepo: packaged ? markerRepo() : undefined,
    packaged,
    root: path.resolve(root),
  });
  if (dir !== undefined) {
    app.setPath("userData", dir);
  }
};
