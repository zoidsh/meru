import { net } from "electron";

import type { OnlinePort } from "../../core/ports.ts";

const POLL = 5000;

// Electron's main process has no event for a connection coming back, only net.isOnline(), so a change is found by polling, and only while something waits for one.
export const onlinePort: OnlinePort = {
  isOnline: () => net.isOnline(),
  onChange: (listener) => {
    let last = net.isOnline();
    const timer = setInterval(() => {
      const online = net.isOnline();
      if (online !== last) {
        last = online;
        listener(online);
      }
    }, POLL);
    return () => {
      clearInterval(timer);
    };
  },
};
