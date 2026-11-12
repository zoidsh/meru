import type { IpcTransportPort } from "../../core/ports.ts";

export class FakeIpcTransport implements IpcTransportPort {
  readonly sent: {
    readonly contentsId: number;
    readonly channel: string;
    readonly payload: unknown;
  }[] = [];

  readonly send = (contentsId: number, channel: string, payload: unknown) => {
    this.sent.push({ channel, contentsId, payload });
  };
}
