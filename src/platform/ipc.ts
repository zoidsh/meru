import { ipcMain, webContents } from "electron";
import type { IpcMainEvent, IpcMainInvokeEvent } from "electron";

/** Who sent a message: its webContents and the frame within it. */
export interface IpcSender {
  webContentsId: number;
  isMainFrame: boolean;
  /** Nothing when the frame has gone or navigated since sending. */
  origin: string | undefined;
}

export interface Ipc {
  /** Answers `invoke` on `channel`; a rejection reaches the caller. */
  handle: (
    channel: string,
    handler: (sender: IpcSender, payload: unknown) => Promise<unknown>
  ) => void;
  on: (
    channel: string,
    listener: (sender: IpcSender, payload: unknown) => void
  ) => void;
  /** Nothing when the receiver is gone. */
  send: (webContentsId: number, channel: string, message: unknown) => void;
}

const describeSender = (
  event: IpcMainEvent | IpcMainInvokeEvent
): IpcSender => {
  const frame = event.senderFrame;

  return {
    webContentsId: event.sender.id,
    isMainFrame: frame !== null && frame.parent === null,
    origin: frame?.origin,
  };
};

export const createIpc = (): Ipc => ({
  handle: (channel, handler) => {
    ipcMain.handle(channel, (event, payload: unknown) =>
      handler(describeSender(event), payload)
    );
  },
  on: (channel, listener) => {
    ipcMain.on(channel, (event, payload: unknown) => {
      listener(describeSender(event), payload);
    });
  },
  send: (webContentsId, channel, message) => {
    const receiver = webContents.fromId(webContentsId);

    if (receiver && !receiver.isDestroyed()) {
      receiver.send(channel, message);
    }
  },
});
