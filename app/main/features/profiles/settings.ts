import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const profilesSettings = [
  defineSetting("profiles.unreadBadge", {
    default: true,
    description: msg`Show each profile's unread count on its button in the titlebar.`,
    label: msg`Show unread badges`,
    page: "appearance",
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
] as const;
