import { t } from "@lingui/core/macro";

export type ExtensionWindowOutcome = "opened" | "notLoaded" | "refused";

/**
 * A restart helps only an extension that isn't loaded yet. A loaded one whose
 * window the loader refuses stays refused after any number of restarts, so it
 * gets no advice to try one.
 */
export function getExtensionWindowError(name: string | undefined, outcome: ExtensionWindowOutcome) {
  switch (outcome) {
    case "opened": {
      return undefined;
    }
    case "notLoaded": {
      return name
        ? t({
            message: `${name} starts after Meru restarts. Restart Meru, then try again.`,
            comment: "name is the name of a browser extension, such as Bitwarden",
          })
        : t`The extension starts after Meru restarts. Restart Meru, then try again.`;
    }
    case "refused": {
      return name
        ? t({
            message: `${name} is running, but Meru can't open a window for it.`,
            comment: "name is the name of a browser extension, such as Bitwarden",
          })
        : t`The extension is running, but Meru can't open a window for it.`;
    }
  }
}
