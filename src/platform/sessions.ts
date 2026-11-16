import { session } from "electron";

export interface Sessions {
  /** Every kind of data the partition's session holds, cache included. */
  clear: (partition: string) => Promise<void>;
}

export const createSessions = (): Sessions => ({
  clear: (partition) => session.fromPartition(partition).clearData(),
});
