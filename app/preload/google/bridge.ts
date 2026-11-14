import { ipcRenderer, webFrame } from "electron";
import type { IpcRendererEvent } from "electron";

import type { GoogleSurface } from "../../shared/channels/surfaces.ts";
import { createBridge } from "../content/bridge-port.ts";
import type { Bridge } from "../content/bridge-port.ts";
import { contentAllowlist } from "../content/surface-allowlist.ts";

export const googleBridge: Bridge<GoogleSurface> = createBridge<GoogleSurface>(
  contentAllowlist(process.argv, "google"),
  {
    on: (channel, listener) => {
      const forward = (_event: IpcRendererEvent, payload: unknown) => {
        listener(payload);
      };
      ipcRenderer.on(channel, forward);
      return () => {
        ipcRenderer.off(channel, forward);
      };
    },
    send: (channel, payload) => {
      ipcRenderer.send(channel, payload);
    },
    sendSync: (channel, payload) => {
      const answer: unknown = ipcRenderer.sendSync(channel, payload);
      return answer;
    },
  }
);

/**
 * The "Docs Offline" extension injects a script that does nothing but set these globals, which tell Docs the clipboard permissions it has; without them the Edit menu's cut, copy and paste only offer to install the extension. The pane grants the clipboard itself, so only the globals are missing, and they have to be in the page's own world, which is the one thing a content preload writes there.
 */
const markDocsExtensionInstalled = () => {
  Reflect.set(window, "_docs_chrome_extension_exists", true);
  Reflect.set(window, "_docs_chrome_extension_permissions", [
    "clipboardRead",
    "clipboardWrite",
  ]);
};

export const grantDocsClipboard = async (): Promise<void> => {
  try {
    await webFrame.executeJavaScript(
      `(${markDocsExtensionInstalled.toString()})()`
    );
  } catch (error) {
    // Main hears a page's console error, which is where a preload's failure belongs.
    // oxlint-disable-next-line eslint/no-console
    console.error("Meru could not grant Docs the clipboard", error);
  }
};
