import { sortBy } from "es-toolkit";
import { z } from "zod";

import { gmailCommands } from "../../main/features/gmail/commands.ts";
import { googleCommands } from "../../main/features/google/commands.ts";
import { launcherCommands } from "../../main/features/launcher/commands.ts";
import { profilesCommands } from "../../main/features/profiles/commands.ts";
import { settingsCommands } from "../../main/features/settings/commands.ts";
import { sidebarCommands } from "../../main/features/sidebar/commands.ts";
import { sleepCommands } from "../../main/features/sleep/commands.ts";
import { stageCommands } from "../../main/features/stage/commands.ts";
import { updaterCommands } from "../../main/features/updater/commands.ts";
import { commandsOf } from "./define.ts";
import type { Command, CommandSection } from "./define.ts";

const groups = [
  gmailCommands,
  googleCommands,
  launcherCommands,
  profilesCommands,
  settingsCommands,
  sidebarCommands,
  sleepCommands,
  stageCommands,
  updaterCommands,
] as const;

export const commands = [
  ...commandsOf(gmailCommands),
  ...commandsOf(googleCommands),
  ...commandsOf(launcherCommands),
  ...commandsOf(profilesCommands),
  ...commandsOf(settingsCommands),
  ...commandsOf(sidebarCommands),
  ...commandsOf(sleepCommands),
  ...commandsOf(stageCommands),
  ...commandsOf(updaterCommands),
];

export type CommandId = (typeof commands)[number]["id"];

/** Each feature's commands under its section, in the sections' order, as the shortcuts page lists them. */
export const commandSections: readonly (CommandSection & {
  readonly feature: string;
  readonly commands: readonly Command<CommandId>[];
})[] = sortBy(groups, [(group) => group.section.order]).map((group) => ({
  ...group.section,
  commands: commands.filter((command) =>
    command.id.startsWith(`${group.feature}.`)
  ),
  feature: group.feature,
}));

/** The command an id names. */
export const commandById = (id: CommandId): Command<CommandId> => {
  const found = commands.find((command) => command.id === id);
  if (found === undefined) {
    throw new Error(`${id} is not a command`);
  }
  return found;
};

export const commandIdSchema = z.enum(
  commands.map((command): CommandId => command.id)
);
