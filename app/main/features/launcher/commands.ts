import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const launcherCommands = defineCommands("tabs", {
  new: {
    label: msg`New tab`,
    menu: { order: 10, section: "file" },
    shortcut: { default: "CmdOrCtrl+T" },
  },
});
