import { useSyncExternalStore } from "react";

import type {
  ShellBridge,
  ShellSliceName,
  ShellState,
} from "#contract/shell.ts";
import { createContractSync } from "#contract/sync.ts";

declare global {
  interface Window {
    meru: ShellBridge;
  }
}

let connection: ReturnType<typeof createContractSync<ShellState>> | undefined;

const connect = () => {
  connection ??= createContractSync<ShellState>(window.meru, [
    "profiles",
    "tabs",
    "sidebar",
    "appearance",
    "shortcuts",
    "ariaShortcuts",
    "navigation",
    "doNotDisturb",
    "overlay",
    "inbox",
    "downloads",
    "windows",
    "language",
    "pro",
  ]);

  return connection;
};

/**
 * Shows the page in each language main names after the one it was loaded
 * in, every string at once.
 */
export const followLanguage = (show: (language: string) => void) => {
  const { subscribe, read } = connect();

  subscribe(() => {
    const language = read("language");

    if (language !== undefined) {
      show(language);
    }
  });
};

/** A slice of main's state, or nothing until the first snapshot. */
export const useShellState = <Name extends ShellSliceName>(slice: Name) => {
  const { subscribe, read } = connect();

  return useSyncExternalStore(subscribe, () => read(slice));
};

export const shellCalls = () => window.meru.calls;
