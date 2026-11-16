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
 * The folder in `appData` a packaged build keeps its user data in. A `-dev`
 * prerelease is a build from this branch, and gets a folder of its own so it
 * can never open, or take the single instance lock of, an installed Meru's
 * profiles.
 */
export const userDataNameFor = (productName: string, version: string) =>
  /^\d+\.\d+\.\d+-dev(?:[.+]|$)/u.test(version)
    ? `${productName} Dev`
    : productName;

export interface PackagedUserDataCheck {
  isPackaged: boolean;
  productName: string;
  version: string;
  appData: string;
  /** Whether `--user-data-dir` was passed, which always wins. */
  hasUserDataDirSwitch: boolean;
}

/**
 * The user data directory a packaged build must move to before anything uses
 * it, or nothing when Electron's default, `appData` joined with the product
 * name, is already right.
 */
export const packagedUserDataDir = ({
  isPackaged,
  productName,
  version,
  appData,
  hasUserDataDirSwitch,
}: PackagedUserDataCheck): string | undefined => {
  if (!isPackaged || hasUserDataDirSwitch) {
    return;
  }

  const name = userDataNameFor(productName, version);

  return name === productName ? undefined : path.join(appData, name);
};

/**
 * Windows groups taskbar buttons and notifications by this id, so a run from
 * the repository takes one of its own rather than an installed Meru's.
 */
export const appUserModelIdFor = (appId: string, isPackaged: boolean) =>
  isPackaged ? appId : `${appId}.dev`;
