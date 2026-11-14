import { ipcMain, webContents } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

import { DisposableStore } from "../../core/disposable.ts";
import type { IpcTransportPort, Unsubscribe } from "../../core/ports.ts";
import type { Allowlist } from "../../shared/channels/define.ts";

type Dispatch = (
  contentsId: number,
  channel: string,
  payload: unknown
) => unknown;

export const ipcTransport: IpcTransportPort = {
  send: (contentsId, channel, payload) => {
    const contents = webContents.fromId(contentsId);
    if (contents === undefined || contents.isDestroyed()) {
      return false;
    }
    contents.send(channel, payload);
    return true;
  },
};

export const listenIpc = (
  names: Omit<Allowlist, "push">,
  dispatch: Dispatch
): Unsubscribe => {
  const disposables = new DisposableStore();
  for (const channel of names.event) {
    const listener = (event: IpcMainEvent, payload: unknown) => {
      dispatch(event.sender.id, channel, payload);
    };
    ipcMain.on(channel, listener);
    disposables.add(() => {
      ipcMain.off(channel, listener);
    });
  }
  for (const channel of names.invoke) {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, payload: unknown) =>
      dispatch(event.sender.id, channel, payload)
    );
    disposables.add(() => {
      ipcMain.removeHandler(channel);
    });
  }
  for (const channel of names.sync) {
    const listener = (event: IpcMainEvent, payload: unknown) => {
      event.returnValue = dispatch(event.sender.id, channel, payload);
    };
    ipcMain.on(channel, listener);
    disposables.add(() => {
      ipcMain.off(channel, listener);
    });
  }
  return () => {
    disposables.dispose();
  };
};
