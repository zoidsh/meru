import type { IpcTransportPort } from "../../core/ports.ts";

export class FakeIpcTransport implements IpcTransportPort {
  readonly sent: {
    readonly contentsId: number;
    readonly channel: string;
    readonly payload: unknown;
  }[] = [];

  /** Web contents that were destroyed, which nothing reaches any more. */
  readonly gone = new Set<number>();

  readonly send = (contentsId: number, channel: string, payload: unknown) => {
    if (this.gone.has(contentsId)) {
      return false;
    }
    this.sent.push({ channel, contentsId, payload });
    return true;
  };
}
