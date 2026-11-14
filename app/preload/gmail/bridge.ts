import { ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

import type { GmailSurface } from "../../shared/channels/surfaces.ts";
import { createBridge } from "../content/bridge-port.ts";
import type { Bridge } from "../content/bridge-port.ts";
import { contentAllowlist } from "../content/surface-allowlist.ts";

// Nothing of this is handed to the page: the preload's own world talks to main, and the page sees only what the features do to its DOM.
export const gmailBridge: Bridge<GmailSurface> = createBridge<GmailSurface>(
  contentAllowlist(process.argv, "gmail"),
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
