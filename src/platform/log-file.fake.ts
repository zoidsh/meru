import type { LogFile } from "./log-file.ts";

/** A log held in memory; `copies` has each copy made, by destination. */
const refuse = () => new Error("ENOSPC: no space left on device");

export const fakeLogFile = ({
  failing = false,
}: {
  /** Every write and copy rejects or throws, as on a full disk. */
  failing?: boolean;
} = {}): LogFile & { text: () => string; copies: Map<string, string> } => {
  let text = "";
  const copies = new Map<string, string>();

  return {
    file: "/data/logs/main.log",
    text: () => text,
    copies,
    append: (more) => {
      if (failing) {
        return Promise.reject(refuse());
      }

      text += more;

      return Promise.resolve();
    },
    appendSync: (more) => {
      if (failing) {
        throw refuse();
      }

      text += more;
    },
    copyTo: (destination) => {
      if (failing) {
        return Promise.reject(refuse());
      }

      copies.set(destination, text);

      return Promise.resolve();
    },
  };
};
