import { z } from "zod";

import { parseAccelerator } from "../../../core/engines/shortcuts.ts";
import { commandIdSchema } from "../../../shared/commands/registry.ts";
import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

const acceleratorSchema = z
  .string()
  .refine((text) => parseAccelerator(text) !== undefined, {
    message: "Not an accelerator Electron reads",
  });

export const shortcutsSettings = [
  defineSetting("shortcuts.bindings", {
    default: {},
    description: msg`A command's shortcut, or none, in place of its default.`,
    label: msg`Shortcuts`,
    page: "shortcuts",
    restart: false,
    schema: z.partialRecord(commandIdSchema, acceleratorSchema.nullable()),
    scope: "global",
    tier: "free",
  }),
] as const;
