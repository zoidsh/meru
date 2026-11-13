import type { Unsubscribe } from "../../core/ports.ts";
import type { Result } from "../../core/result.ts";
import type { Name } from "../key.ts";
import type { Message } from "../msg.ts";

/** `app` is the app menu on macOS and the Help menu elsewhere. */
export type MenuSectionId = "app" | "file" | "edit" | "view" | "profiles";

export interface CommandSpec {
  readonly label: Message;
  /** In Electron's accelerator form; the user's binding in `shortcuts.bindings` replaces it. */
  readonly shortcut?: { readonly default: string };
  readonly menu?: { readonly section: MenuSectionId; readonly order: number };
}

export type CommandSpecs = Readonly<Record<string, CommandSpec>>;

export interface CommandGroup<
  F extends string = string,
  C extends CommandSpecs = CommandSpecs,
> {
  readonly feature: F;
  readonly commands: C;
}

export interface Command<Id extends string = string> extends CommandSpec {
  readonly id: Id;
}

export type CommandIdOf<G extends CommandGroup> =
  `${G["feature"]}.${keyof G["commands"] & string}`;

type Named<C> = {
  readonly [N in keyof C]: N extends string
    ? N extends Name<N>
      ? C[N]
      : never
    : never;
};

/** A feature's commands, each id `feature.name`; a name is camelCase with no dot. */
export const defineCommands = <
  const F extends string,
  const C extends CommandSpecs,
>(
  feature: F & Name<F>,
  commands: C & Named<C>
): CommandGroup<F, C> => ({ commands, feature });

export const commandsOf = <F extends string, C extends CommandSpecs>(
  group: CommandGroup<F, C>
): Command<CommandIdOf<CommandGroup<F, C>>>[] =>
  Object.keys(group.commands)
    .filter((name): name is keyof C & string =>
      Object.hasOwn(group.commands, name)
    )
    .map((name) => ({
      ...group.commands[name],
      id: `${group.feature}.${name}`,
    }));

/** A page the chrome shows in place of the panes. */
export type ChromePage = "none" | "settings";

/** What a command is given for: its window, and what that window shows. */
export interface CommandContext {
  /** The window the command was given for. */
  readonly windowId: number;
  readonly page: ChromePage;
  readonly focusedPaneId: string | null;
}

export type CommandHandler = (
  context: CommandContext
) => Result<unknown, string>;

/** A handler with the condition its command can run under; the menu shows the command disabled while `when` is false, and its shortcut reaches the page instead. */
export interface GuardedHandler {
  readonly run: CommandHandler;
  readonly when: (context: CommandContext) => boolean;
}

export type CommandHandlers<C extends CommandSpecs> = {
  readonly [N in keyof C]: CommandHandler | GuardedHandler;
};

export const guardOf = (
  handler: CommandHandler | GuardedHandler
): GuardedHandler =>
  typeof handler === "function" ? { run: handler, when: () => true } : handler;

export interface CommandRegistrar {
  readonly register: <F extends string, C extends CommandSpecs>(
    group: CommandGroup<F, C>,
    handlers: CommandHandlers<C>
  ) => Unsubscribe;
}
