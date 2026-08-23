import type { IpcCall } from "./types";

/**
 * The shell and the preview are separate documents on purpose: only the preview
 * has a fake `window.electron` under it, so the shell's own controls can't
 * reach the renderer's modules by accident, and dark mode and the platform
 * apply to the component alone. What the two have to say to each other
 * therefore travels by `postMessage`.
 */
export type PreviewMessage = {
  type: "ipcCall";
  call: IpcCall;
};

export type ShellMessage = {
  type: "darkMode";
  darkMode: boolean;
};

export function isPreviewMessage(data: unknown): data is PreviewMessage {
  return typeof data === "object" && data !== null && "type" in data && data.type === "ipcCall";
}

export function isShellMessage(data: unknown): data is ShellMessage {
  return typeof data === "object" && data !== null && "type" in data && data.type === "darkMode";
}
