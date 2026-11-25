import { createRequestBlocker } from "#platform/requests.ts";

import { createContentBlocker } from "../content-blocker.ts";
import type { SettingsStore } from "../settings.ts";

/** The blocker of ads and trackers, for each profile's session as it is prepared. */
export const wireContentBlocker = ({
  settings,
  signInOrigins,
}: {
  settings: Pick<SettingsStore, "get" | "onChange">;
  signInOrigins: readonly string[];
}) =>
  createContentBlocker({
    requests: createRequestBlocker(),
    settings,
    protectedOrigins: signInOrigins,
  });
