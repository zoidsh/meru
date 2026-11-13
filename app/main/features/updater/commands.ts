import { defineCommands } from "../../../shared/commands/define.ts";
import { msg } from "../../../shared/msg.ts";

export const updaterCommands = defineCommands("updater", {
  check: {
    label: msg`Check for updates…`,
    menu: { order: 1, section: "app" },
  },
  install: {
    label: msg`Restart to update`,
    menu: { order: 2, section: "app" },
  },
});
