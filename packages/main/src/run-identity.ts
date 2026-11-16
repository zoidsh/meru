import path from "node:path";

import { isDevVersion } from "@meru/core/app-identity";

export interface UserDataInput {
  isPackaged: boolean;
  productName: string;
  version: string;
  appData: string;
  /** The names an installed Meru keeps its user data under in `appData`. */
  installedNames: readonly string[];
  /**
   * The value of `--user-data-dir`: undefined when it was not passed, and
   * empty when it was passed bare or with no value.
   */
  userDataDirSwitch: string | undefined;
  platform: NodeJS.Platform;
}

export type UserDataDecision =
  /** `move` when Electron must be told the directory before anything uses it. */
  | { kind: "use"; dir: string; move: boolean }
  | { kind: "refuse"; reason: string };

const normalize = (dir: string, platform: NodeJS.Platform) => {
  const resolved = path.resolve(dir).replace(/[/\\]+$/u, "");

  // macOS and Windows file systems are case-insensitive by default.
  return platform === "linux" ? resolved : resolved.toLowerCase();
};

/** The folder in `appData` a packaged `-dev` build keeps its data in. */
export const devUserDataName = (productName: string) => `${productName} Dev`;

/**
 * Where the app keeps its user data, decided from the switch rather than from
 * what Electron resolved: asking Electron for `userData` before it is set
 * creates the default folder, which is an installed Meru's.
 *
 * - A release keeps Electron's default, or the directory it is given.
 * - A build of the development branch never touches an installed Meru's
 *   folder, where its cookies and single instance lock live. Packaged, it
 *   moves to a folder of its own when given no directory; unpackaged, it must
 *   be given one. Either refuses a directory that is the installed one,
 *   however it is spelled.
 */
export const decideUserData = ({
  isPackaged,
  productName,
  version,
  appData,
  installedNames,
  userDataDirSwitch,
  platform,
}: UserDataInput): UserDataDecision => {
  const given = userDataDirSwitch?.trim() ? userDataDirSwitch : undefined;
  const isDevelopment = !isPackaged || isDevVersion(version);

  if (!isDevelopment) {
    return {
      kind: "use",
      dir: path.resolve(given ?? path.join(appData, productName)),
      move: false,
    };
  }

  if (!given) {
    return isPackaged
      ? {
          kind: "use",
          dir: path.join(appData, devUserDataName(productName)),
          move: true,
        }
      : {
          kind: "refuse",
          reason:
            "An unpackaged run needs a user data directory of its own; start it with `pnpm dev` or `pnpm start`.",
        };
  }

  const refused = isPackaged
    ? installedNames
    : [...installedNames, devUserDataName(productName)];
  const resolved = normalize(given, platform);

  if (
    refused.some(
      (name) => normalize(path.join(appData, name), platform) === resolved
    )
  ) {
    return {
      kind: "refuse",
      reason: `A development build may not use an installed Meru's user data at ${given}.`,
    };
  }

  return { kind: "use", dir: path.resolve(given), move: false };
};
