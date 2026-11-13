import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const sidebarCommands = defineCommands(
  "sidebar",
  {
    // Neither 3.x nor Chrome has a sidebar to toggle, so the key is Arc's.
    toggle: {
      label: msg`Toggle sidebar`,
      menu: { order: 10, section: "view" },
      shortcut: { default: "CmdOrCtrl+S" },
    },
    toggleWidth: {
      label: msg`Toggle sidebar width`,
      menu: { order: 11, section: "view" },
    },
  },
  { label: msg`Sidebar`, order: 30 }
);
