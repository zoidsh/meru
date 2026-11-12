import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const stageCommands = defineCommands("stage", {
  closePane: {
    label: msg`Close pane`,
    menu: { order: 3, section: "view" },
    shortcut: { default: "CmdOrCtrl+W" },
  },
  splitHorizontal: {
    label: msg`Split horizontally`,
    menu: { order: 2, section: "view" },
    shortcut: { default: "CmdOrCtrl+Shift+D" },
  },
  splitVertical: {
    label: msg`Split vertically`,
    menu: { order: 1, section: "view" },
    shortcut: { default: "CmdOrCtrl+D" },
  },
});
