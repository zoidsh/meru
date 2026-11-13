import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

// 3.x's keys: the digit row picks a profile in the order the titlebar shows them, and the brackets step through them; one CmdOrCtrl declaration serves every platform.
export const profilesCommands = defineCommands("profiles", {
  next: {
    label: msg`Select next profile`,
    menu: { order: 11, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+Shift+]" },
  },
  previous: {
    label: msg`Select previous profile`,
    menu: { order: 12, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+Shift+[" },
  },
  select1: {
    label: msg`Profile 1`,
    menu: { order: 1, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+1" },
  },
  select2: {
    label: msg`Profile 2`,
    menu: { order: 2, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+2" },
  },
  select3: {
    label: msg`Profile 3`,
    menu: { order: 3, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+3" },
  },
  select4: {
    label: msg`Profile 4`,
    menu: { order: 4, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+4" },
  },
  select5: {
    label: msg`Profile 5`,
    menu: { order: 5, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+5" },
  },
  select6: {
    label: msg`Profile 6`,
    menu: { order: 6, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+6" },
  },
  select7: {
    label: msg`Profile 7`,
    menu: { order: 7, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+7" },
  },
  select8: {
    label: msg`Profile 8`,
    menu: { order: 8, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+8" },
  },
  select9: {
    label: msg`Profile 9`,
    menu: { order: 9, section: "profiles" },
    shortcut: { default: "CmdOrCtrl+9" },
  },
});
