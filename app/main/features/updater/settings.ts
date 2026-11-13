import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const updaterSettings = [
  defineSetting("updater.channel", {
    default: "stable",
    description: msg`Beta also offers releases before they reach everyone.`,
    label: msg`Update channel`,
    page: "updates",
    restart: false,
    schema: z.enum(["stable", "beta"]),
    scope: "global",
    tier: "free",
  }),
  defineSetting("updater.intervalHours", {
    default: 4,
    label: msg`Hours between update checks`,
    page: "updates",
    restart: false,
    schema: z.number().int().min(1).max(168),
    scope: "global",
    tier: "free",
  }),
] as const;
