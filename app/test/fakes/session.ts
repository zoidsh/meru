import type { SessionPort } from "../../core/ports.ts";

export class FakeSessions implements SessionPort {
  /** Every partition cleared, in order, as the effect on the browser's storage. */
  readonly cleared: string[] = [];

  readonly clear = async (partition: string) => {
    await Promise.resolve();
    this.cleared.push(partition);
  };
}
