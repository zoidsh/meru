import { ipcRenderer } from "electron";

export interface DragBridge {
  readonly send: (channel: string, payload: unknown) => void;
}

export const dragBridge: DragBridge = {
  send: (channel, payload) => {
    ipcRenderer.send(channel, payload);
  },
};
