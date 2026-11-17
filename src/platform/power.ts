import { powerMonitor } from "electron";

export interface Power {
  /** Called each time the system wakes from sleep. */
  onResume: (listener: () => void) => void;
}

export const createPower = (): Power => ({
  onResume: (listener) => {
    powerMonitor.on("resume", listener);
  },
});
