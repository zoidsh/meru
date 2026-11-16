import { ipcMain, webContents } from "electron";

export interface Ipc {
  /** Answers `invoke` on `channel`; a rejection reaches the caller. */
  handle: (
    channel: string,
    handler: (senderId: number, payload: unknown) => Promise<unknown>
  ) => void;
  on: (
    channel: string,
    listener: (senderId: number, payload: unknown) => void
  ) => void;
  /** Nothing when the receiver is gone. */
  send: (webContentsId: number, channel: string, message: unknown) => void;
}

export const createIpc = (): Ipc => ({
  handle: (channel, handler) => {
    ipcMain.handle(channel, (event, payload: unknown) =>
      handler(event.sender.id, payload)
    );
  },
  on: (channel, listener) => {
    ipcMain.on(channel, (event, payload: unknown) => {
      listener(event.sender.id, payload);
    });
  },
  send: (webContentsId, channel, message) => {
    const receiver = webContents.fromId(webContentsId);

    if (receiver && !receiver.isDestroyed()) {
      receiver.send(channel, message);
    }
  },
});
