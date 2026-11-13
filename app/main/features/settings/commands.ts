import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const settingsCommands = defineCommands(
  "settings",
  {
    open: {
      label: msg`Settings…`,
      menu: { order: 3, section: "app" },
      shortcut: { default: "CmdOrCtrl+," },
    },
  },
  { label: msg`Settings`, order: 50 }
);
