import { ipcRenderer } from "electron";

export const dragBridge = {
  send: (channel: string, payload: unknown) => {
    ipcRenderer.send(channel, payload);
  },
};
