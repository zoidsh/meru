import { ipcMain, webContents } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import type { IpcTransportPort, Unsubscribe } from "../../core/ports.ts";

export interface IpcNames {
  readonly event: Iterable<string>;
  readonly invoke: Iterable<string>;
  readonly sync: Iterable<string>;
}

export type Dispatch = (
  contentsId: number,
  channel: string,
  payload: unknown
) => unknown;

export const ipcTransport: IpcTransportPort = {
  send: (contentsId, channel, payload) => {
    const contents = webContents.fromId(contentsId);
    if (contents !== undefined && !contents.isDestroyed()) {
      contents.send(channel, payload);
    }
  },
};

export const listenIpc = (names: IpcNames, dispatch: Dispatch): Unsubscribe => {
  const removers: Unsubscribe[] = [];
  for (const channel of new Set(names.event)) {
    const listener = (event: IpcMainEvent, payload: unknown) => {
      dispatch(event.sender.id, channel, payload);
    };
    ipcMain.on(channel, listener);
    removers.push(() => {
      ipcMain.off(channel, listener);
    });
  }
  for (const channel of new Set(names.invoke)) {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, payload: unknown) =>
      dispatch(event.sender.id, channel, payload)
    );
    removers.push(() => {
      ipcMain.removeHandler(channel);
    });
  }
  for (const channel of new Set(names.sync)) {
    const listener = (event: IpcMainEvent, payload: unknown) => {
      event.returnValue = dispatch(event.sender.id, channel, payload);
    };
    ipcMain.on(channel, listener);
    removers.push(() => {
      ipcMain.off(channel, listener);
    });
  }
  return () => {
    for (const remove of removers) {
      remove();
    }
  };
};
