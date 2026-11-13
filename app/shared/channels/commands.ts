import { z } from "zod";

import { commandIdSchema } from "../commands/registry.ts";
import { defineChannels, invoke } from "./define.ts";

export const commands = defineChannels("commands", {
  /** Runs a command for the sender's window, as its menu item would. */
  run: invoke(z.object({ id: commandIdSchema }), z.null()),
});
