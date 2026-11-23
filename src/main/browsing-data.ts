import { browsingDataTypes } from "#core/browsing-data.ts";
import type { BrowsingDataKinds } from "#core/browsing-data.ts";
import { profilePartition } from "#core/state.ts";
import type { Sessions } from "#platform/sessions.ts";

import type { MailPoller } from "./mail.ts";
import type { createTabViews } from "./tab-views.ts";

export interface DeleteBrowsingDataDeps {
  sessions: Pick<Sessions, "clearData">;
  views: Pick<
    ReturnType<typeof createTabViews>,
    "sleepAllButGmail" | "reloadProfile"
  >;
  mail: Pick<MailPoller, "poke">;
}

/**
 * Deletes the kinds of the profile's browsing data asked for, as v3 does.
 * Its session is reached through its partition, so a disabled or sleeping
 * profile's data goes too. Rejects when the session could not clear it.
 */
export const createDeleteBrowsingData =
  ({ sessions, views, mail }: DeleteBrowsingDataDeps) =>
  async (profileId: string, kinds: BrowsingDataKinds) => {
    const dataTypes = browsingDataTypes(kinds);

    if (dataTypes.length === 0) {
      return;
    }

    if (kinds.cookies) {
      views.sleepAllButGmail(profileId);
    }

    try {
      await sessions.clearData(profilePartition(profileId), dataTypes);
    } finally {
      views.reloadProfile(profileId);

      // Signed out now, which the mail check would otherwise learn only at
      // its next poll; a clear that failed may have got as far as cookies.
      if (kinds.cookies) {
        mail.poke(profileId);
      }
    }
  };
