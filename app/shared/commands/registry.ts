import { z } from "zod";

import { stageCommands } from "../../main/features/stage/commands.ts";
import { updaterCommands } from "../../main/features/updater/commands.ts";
import { commandsOf } from "./define.ts";

export const commands = [
  ...commandsOf(stageCommands),
  ...commandsOf(updaterCommands),
];

export type CommandId = (typeof commands)[number]["id"];

export const commandIdSchema = z.enum(
  commands.map((command): CommandId => command.id)
);
