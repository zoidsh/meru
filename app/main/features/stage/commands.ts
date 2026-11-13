import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const stageCommands = defineCommands("stage", {
  back: {
    label: msg`Back`,
    menu: { order: 1, section: "history" },
    shortcut: { darwin: "Command+[", default: "Alt+Left" },
  },
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
  forward: {
    label: msg`Forward`,
    menu: { order: 2, section: "history" },
    shortcut: { darwin: "Command+]", default: "Alt+Right" },
  },
  focusPrevious: {
    label: msg`Focus previous pane`,
    menu: { order: 5, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+," },
  },
  reload: {
    label: msg`Reload`,
    menu: { order: 6, section: "view" },
    shortcut: { default: "CmdOrCtrl+R" },
  },
  stop: { label: msg`Stop` },
  swap: {
    label: msg`Swap with next pane`,
    menu: { order: 7, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+Shift+." },
  },
  balance: {
    label: msg`Balance panes`,
    menu: { order: 8, section: "view" },
    shortcut: { default: "CmdOrCtrl+Alt+=" },
  },
  maximise: {
    label: msg`Maximise pane`,
    menu: { order: 9, section: "view" },
    shortcut: { default: "CmdOrCtrl+Shift+Enter" },
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
