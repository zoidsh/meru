import { isPlainObject } from "es-toolkit";

import type { Migration } from "../../../core/engines/migrate.ts";

/** Version 1 to 2: each tab's stored `sleeping`, which nothing ever set, gives way to `sleeps`, the user's leave to sleep, off as sleep is opt-in. */
export const tabsSleepByChoice: Migration = (data) => {
  if (!isPlainObject(data) || !Array.isArray(data.tabs)) {
    return data;
  }
  return {
    ...data,
    tabs: data.tabs.map((tab: unknown) => {
      if (!isPlainObject(tab)) {
        return tab;
      }
      const { sleeping: _dropped, ...rest } = tab;
      return { ...rest, sleeps: false };
    }),
  };
};
