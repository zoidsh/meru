import type { Unsubscribe } from "../../core/ports.ts";
import { err, ok } from "../../core/result.ts";
import type { Result } from "../../core/result.ts";
import { commands as channels } from "../../shared/channels/commands.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { commandsOf, guardOf } from "../../shared/commands/define.ts";
import type {
  CommandGroup,
  CommandHandler,
  CommandHandlers,
  GuardedHandler,
  CommandRegistrar,
  CommandSpecs,
} from "../../shared/commands/define.ts";
import type { CommandId } from "../../shared/commands/registry.ts";

/** Holds each command's handler, registered by the feature that declares it, and runs one by id for the menu, a shortcut or a page. */
export class CommandDispatcher<
  Id extends string = CommandId,
> implements CommandRegistrar {
  readonly #handlers = new Map<string, GuardedHandler>();

  readonly register = <F extends string, C extends CommandSpecs>(
    group: CommandGroup<F, C>,
    handlers: CommandHandlers<C>
  ): Unsubscribe => {
    const ids = commandsOf(group).map((command) => {
      if (this.#handlers.has(command.id)) {
        throw new Error(`${command.id} has a handler already`);
      }
      return command.id;
    });
    for (const [name, handler] of Object.entries<
      CommandHandler | GuardedHandler
    >(handlers)) {
      this.#handlers.set(`${group.feature}.${name}`, guardOf(handler));
    }
    return () => {
      for (const id of ids) {
        this.#handlers.delete(id);
      }
    };
  };

  has(id: Id): boolean {
    return this.#handlers.has(id);
  }

  /** Whether the command can run now for the window, or with no window when none is given; one nothing handles cannot. */
  enabled(id: Id, windowId?: number): boolean {
    return (
      this.#handlers.get(id)?.when({ windowId: windowId ?? null }) ?? false
    );
  }

  run(
    id: Id,
    { windowId }: { readonly windowId: number }
  ): Result<unknown, string> {
    return this.#run(id, windowId);
  }

  /** Answers a page's `commands.run` for the page's own window. */
  start(registrar: IpcRegistrar): Unsubscribe {
    return registrar.register(channels, {
      run: ({ id }, { contentsId }) => {
        const result = this.#run(id, contentsId);
        return result.ok ? ok(null) : result;
      },
    });
  }

  #run(id: string, windowId: number): Result<unknown, string> {
    const handler = this.#handlers.get(id);
    const context = { windowId };
    if (handler === undefined) {
      return err(`Nothing handles ${id}`);
    }
    return handler.when(context)
      ? handler.run(context)
      : err(`${id} cannot run now`);
  }
}
