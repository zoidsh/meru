import { z } from "zod";

import { profilesCommands } from "../../main/features/profiles/commands.ts";
import { sidebarCommands } from "../../main/features/sidebar/commands.ts";
import { stageCommands } from "../../main/features/stage/commands.ts";
import { updaterCommands } from "../../main/features/updater/commands.ts";
import { commandsOf } from "./define.ts";

export const commands = [
  ...commandsOf(profilesCommands),
  ...commandsOf(sidebarCommands),
  ...commandsOf(stageCommands),
  ...commandsOf(updaterCommands),
];

export type CommandId = (typeof commands)[number]["id"];

export const commandIdSchema = z.enum(
  commands.map((command): CommandId => command.id)
);
