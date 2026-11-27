import { contextBridge, ipcRenderer } from "electron";

import { SHELL_CALL_NAMES, SHELL_CHANNELS } from "#contract/shell-channels.ts";
import type { ShellBridge, ShellCalls, ShellState } from "#contract/shell.ts";

import { contractBridge } from "../bridge.ts";

// Stamped on the document rather than exposed, so styles can make room for the
// macOS traffic lights without the page reaching anything of the preload's.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.platform = process.platform;
});

const bridge: ShellBridge = {
  ...contractBridge<ShellCalls, ShellState>(SHELL_CALL_NAMES, SHELL_CHANNELS),
  onSound: (listener) => {
    const receive = (_event: unknown, request: unknown) => {
      listener(request);
    };

    ipcRenderer.on(SHELL_CHANNELS.sound, receive);

    return () => {
      ipcRenderer.off(SHELL_CHANNELS.sound, receive);
    };
  },
};

contextBridge.exposeInMainWorld("meru", bridge);
