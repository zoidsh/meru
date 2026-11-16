import { net } from "electron";

export interface Network {
  /** Called each time the network comes back. Returns what stops it. */
  onOnline: (listener: () => void) => () => void;
}

// Electron's main process has no network-change event; `net.isOnline()` reads
// Chromium's change notifier, so polling it costs nothing.
const POLL_INTERVAL = 5000;

export const createNetwork = (): Network => ({
  onOnline: (listener) => {
    let wasOnline = net.isOnline();
    const timer = setInterval(() => {
      const isOnline = net.isOnline();

      if (isOnline && !wasOnline) {
        listener();
      }

      wasOnline = isOnline;
    }, POLL_INTERVAL);

    return () => {
      clearInterval(timer);
    };
  },
});
