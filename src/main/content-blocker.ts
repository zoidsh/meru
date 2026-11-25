import { createBlockMatcher } from "#core/blocker.ts";
import type { RequestBlocker } from "#platform/requests.ts";

import type { SettingsStore } from "./settings.ts";

/**
 * Blocks ads and trackers in every profile's session, as Block ads and Block
 * trackers say. A change reaches each session's next request at once; what a
 * page already loaded stays until it loads again.
 */
export const createContentBlocker = ({
  requests,
  settings,
  protectedOrigins,
}: {
  requests: RequestBlocker;
  settings: Pick<SettingsStore, "get" | "onChange">;
  /** Never blocked: Google's sign-in. */
  protectedOrigins: readonly string[];
}) => {
  const partitions = new Set<string>();
  const build = () =>
    createBlockMatcher(
      {
        ads: settings.get("blockAds"),
        trackers: settings.get("blockTrackers"),
      },
      protectedOrigins
    );
  let blocks = build();

  const follow = () => {
    blocks = build();

    for (const partition of partitions) {
      requests.block(partition, blocks);
    }
  };

  settings.onChange("blockAds", follow);
  settings.onChange("blockTrackers", follow);

  return {
    /** Before a session's first page, once per session. */
    prepare: (partition: string) => {
      if (partitions.has(partition)) {
        return;
      }

      partitions.add(partition);
      requests.block(partition, blocks);
    },
  };
};

export type ContentBlocker = ReturnType<typeof createContentBlocker>;
