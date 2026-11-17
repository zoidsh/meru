import { contextBridge, ipcRenderer } from "electron";

import { SHELL_CALL_NAMES, SHELL_CHANNELS } from "#contract/shell-channels.ts";
import type {
  ShellBridge,
  ShellCalls,
  ShellSyncMessage,
} from "#contract/shell.ts";

// Stamped on the document rather than exposed, so styles can make room for the
// macOS traffic lights without the page reaching anything of the preload's.
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.dataset.platform = process.platform;
});

const calls = Object.fromEntries(
  SHELL_CALL_NAMES.map((name) => [
    name,
    (request: unknown) =>
      ipcRenderer.invoke(SHELL_CHANNELS.call(name), request),
  ])
) as ShellCalls;

const bridge: ShellBridge = {
  calls,
  sync: (slices, listener) => {
    const receive = (_event: unknown, message: ShellSyncMessage) => {
      listener(message);
    };

    // Listening before the handshake, so nothing main sends is missed.
    ipcRenderer.on(SHELL_CHANNELS.state, receive);
    ipcRenderer.send(SHELL_CHANNELS.sync, slices);

    return () => {
      ipcRenderer.off(SHELL_CHANNELS.state, receive);
    };
  },
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
