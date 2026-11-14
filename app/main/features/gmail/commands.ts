import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const gmailCommands = defineCommands(
  "gmail",
  {
    editUserStyles: { label: msg`Edit Gmail user styles` },
    revealUserStyles: { label: msg`Show Gmail user styles in folder` },
  },
  { label: msg`Gmail`, order: 45 }
);
