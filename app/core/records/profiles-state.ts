import { z } from "zod";

import { groupSchema } from "./group.ts";
import { idSchema } from "./id.ts";
import { profileSchema } from "./profile.ts";
import { tabSchema } from "./tab.ts";

/** What profiles.json holds: every profile, tab and group, and the profile the main window shows. The order of `tabs` is the sidebar's. */
export const profilesStateSchema = z.object({
  groups: z.array(groupSchema),
  profiles: z.array(profileSchema),
  selectedProfileId: idSchema,
  tabs: z.array(tabSchema),
});

export type ProfilesState = z.infer<typeof profilesStateSchema>;
