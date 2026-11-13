import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const stageCommands = defineCommands("stage", {
  closeTab: {
    label: msg`Close tab`,
    menu: { order: 3, section: "view" },
    shortcut: { default: "CmdOrCtrl+Shift+W" },
  },
  // Electron has no name for the period and comma keys; an accelerator spells them as the characters.
  focusNext: {
    label: msg`Focus next pane`,
    menu: { order: 4, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+." },
  },
  focusPrevious: {
    label: msg`Focus previous pane`,
    menu: { order: 5, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+," },
  },
  splitHorizontal: {
    label: msg`Split horizontally`,
    menu: { order: 2, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+Shift+N" },
  },
  splitVertical: {
    label: msg`Split vertically`,
    menu: { order: 1, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+N" },
  },
});
