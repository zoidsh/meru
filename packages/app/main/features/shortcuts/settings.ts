import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const shortcutsSettings = [
  defineSetting("shortcuts.bindings", {
    default: {},
    description: msg`A command's shortcut, or none, in place of its default.`,
    label: msg`Shortcuts`,
    page: "shortcuts",
    restart: false,
    schema: z.record(z.string(), z.string().nullable()),
    scope: "global",
    tier: "free",
  }),
] as const;
