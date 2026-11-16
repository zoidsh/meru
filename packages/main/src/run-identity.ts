import path from "node:path";

export interface UserDataCheck {
  isPackaged: boolean;
  /** What Electron resolved `userData` to, after any `--user-data-dir`. */
  userData: string;
  appData: string;
  /** The names an installed Meru keeps its user data under in `appData`. */
  appNames: readonly string[];
  platform: NodeJS.Platform;
}

const normalize = (dir: string, platform: NodeJS.Platform) => {
  const resolved = path.resolve(dir).replace(/[/\\]+$/u, "");

  // macOS and Windows file systems are case-insensitive by default.
  return platform === "linux" ? resolved : resolved.toLowerCase();
};

/**
 * Why an unpackaged run may not use the user data directory it resolved, or
 * nothing when it may. Such a run must name a directory of its own: an empty
 * `--user-data-dir` makes Chromium fall back to the default, which is where an
 * installed Meru keeps its cookies and single instance lock.
 */
export const refuseUserDataDir = ({
  isPackaged,
  userData,
  appData,
  appNames,
  platform,
}: UserDataCheck): string | undefined => {
  if (isPackaged) {
    return;
  }

  if (userData.trim() === "") {
    return "An unpackaged run resolved no user data directory.";
  }

  const resolved = normalize(userData, platform);
  const installed = appNames.map((name) =>
    normalize(path.join(appData, name), platform)
  );

  if (installed.includes(resolved)) {
    return `An unpackaged run would use an installed Meru's user data at ${userData}; start it with \`pnpm dev\` or \`pnpm start\`.`;
  }
};

/**
 * Windows groups taskbar buttons and notifications by this id, so a run from
 * the repository takes one of its own rather than an installed Meru's.
 */
export const appUserModelIdFor = (appId: string, isPackaged: boolean) =>
  isPackaged ? appId : `${appId}.dev`;
