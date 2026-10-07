export type ExtensionWindowOutcome = "opened" | "notLoaded" | "refused";

/**
 * A restart helps only an extension that isn't loaded yet. A loaded one whose
 * window the loader refuses stays refused after any number of restarts, so it
 * gets no advice to try one.
 */
export function getExtensionWindowError(name: string, outcome: ExtensionWindowOutcome) {
  switch (outcome) {
    case "opened": {
      return undefined;
    }
    case "notLoaded": {
      return `${name} starts after Meru restarts. Restart Meru, then try again.`;
    }
    case "refused": {
      return `${name} is running, but Meru can't open a window for it.`;
    }
  }
}
