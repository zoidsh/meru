import { z } from "zod";

import { profileSchema } from "../core/records/profile.ts";
import { profilesStateSchema } from "../core/records/profiles-state.ts";

/** What a page is told about profiles: the state, with each profile marked deactivated when the entitlement does not allow it. */
export const profilesSnapshotSchema = profilesStateSchema.extend({
  profiles: z.array(profileSchema.extend({ deactivated: z.boolean() })),
});

export type ProfilesSnapshot = z.infer<typeof profilesSnapshotSchema>;
