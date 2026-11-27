import { contextBridge } from "electron";

import { SHELL_CALL_NAMES, SHELL_CHANNELS } from "#contract/shell-channels.ts";
import type { ShellBridge, ShellCalls, ShellState } from "#contract/shell.ts";

import { contractBridge } from "../bridge.ts";

// Stamped on the document rather than exposed, so styles can make room for the
// macOS traffic lights without the page reaching anything of the preload's.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.platform = process.platform;
});

const bridge: ShellBridge = contractBridge<ShellCalls, ShellState>(
  SHELL_CALL_NAMES,
  SHELL_CHANNELS
);

contextBridge.exposeInMainWorld("meru", bridge);
