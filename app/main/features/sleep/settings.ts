import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import {
  defineSetting,
  defineSettingsPage,
} from "../../../shared/settings/define.ts";

export const sleepPage = defineSettingsPage("sleep", {
  icon: "moon",
  label: msg`Sleep`,
  order: 35,
});

export const sleepSettings = [
  defineSetting("sleep.afterMinutes", {
    default: 60,
    description: msg`A tab you let sleep gives its memory back once it has been out of sight this long, and loads again when you show it. Gmail never sleeps.`,
    label: msg`Sleep after (minutes)`,
    page: sleepPage.id,
    restart: false,
    schema: z
      .number()
      .int()
      .min(1)
      .max(24 * 60),
    scope: "global",
    tier: "free",
  }),
] as const;
