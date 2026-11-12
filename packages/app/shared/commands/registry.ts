import { z } from "zod";

import { stageCommands } from "../../main/features/stage/commands.ts";
import { commandsOf } from "./define.ts";

// Every feature's commands.ts, assembled here and nowhere else.
export const commands = [...commandsOf(stageCommands)];

export type CommandId = (typeof commands)[number]["id"];

export const commandIdSchema = z.enum(
  commands.map((command): CommandId => command.id)
);
