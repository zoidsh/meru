import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import {
  defineSetting,
  defineSettingsPage,
} from "../../../shared/settings/define.ts";

export const profilesPage = defineSettingsPage("profiles", {
  label: msg`Profiles`,
  order: 10,
});

export const profilesSettings = [
  defineSetting("profiles.unreadBadge", {
    default: true,
    description: msg`Show each profile's unread count on its button in the titlebar.`,
    label: msg`Show unread badges`,
    page: "appearance",
    section: msg`Profiles`,
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
] as const;
