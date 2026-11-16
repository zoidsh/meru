import { throttle } from "es-toolkit";

import { tabKey } from "#core/tabs.ts";
import type { PageUpdate } from "#core/tabs.ts";

/** How often at most where the tabs' pages are is written to state. */
export const PAGE_WRITE_INTERVAL = 1000;

/**
 * Gathers each tab's latest URL and title and hands them to `write` at most
 * once a second, the first at once and the last when the second is up.
 */
export const createPageWriter = (write: (updates: PageUpdate[]) => void) => {
  const pending = new Map<string, PageUpdate>();

  const flush = throttle(
    () => {
      const updates = [...pending.values()];

      pending.clear();

      if (updates.length > 0) {
        write(updates);
      }
    },
    PAGE_WRITE_INTERVAL,
    { edges: ["leading", "trailing"] }
  );

  return {
    record: (update: PageUpdate) => {
      const key = tabKey(update);

      pending.set(key, { ...pending.get(key), ...update });
      flush();
    },
    /** Drops what a closed tab had waiting. */
    forget: (key: string) => {
      pending.delete(key);
    },
  };
};
