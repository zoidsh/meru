import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const sleepCommands = defineCommands(
  "sleep",
  {
    toggleTab: {
      label: msg`Toggle sleep when idle`,
      menu: { order: 12, section: "view" },
    },
  },
  { label: msg`Sleep`, order: 35 }
);
