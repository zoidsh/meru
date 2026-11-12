import type { Unsubscribe } from "../../core/ports.ts";
import type { Result } from "../../core/result.ts";
import { commandsOf } from "../../shared/commands/define.ts";
import type {
  CommandGroup,
  CommandHandler,
  CommandHandlers,
  CommandRegistrar,
  CommandSpecs,
} from "../../shared/commands/define.ts";

export class FakeCommandRegistrar implements CommandRegistrar {
  readonly #handlers = new Map<string, CommandHandler>();

  readonly register = <F extends string, C extends CommandSpecs>(
    group: CommandGroup<F, C>,
    handlers: CommandHandlers<C>
  ): Unsubscribe => {
    for (const [name, handler] of Object.entries<CommandHandler>(handlers)) {
      this.#handlers.set(`${group.feature}.${name}`, handler);
    }
    return () => {
      for (const command of commandsOf(group)) {
        this.#handlers.delete(command.id);
      }
    };
  };

  get ids(): string[] {
    return [...this.#handlers.keys()];
  }

  /** Runs a command as the menu would for a window. */
  readonly run = (id: string, windowId: number): Result<unknown, string> => {
    const handler = this.#handlers.get(id);
    if (handler === undefined) {
      throw new Error(`Nothing registered ${id}`);
    }
    return handler({ windowId });
  };
}
