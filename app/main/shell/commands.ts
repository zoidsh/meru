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
    const given = new Map(
      Object.entries<CommandHandler | GuardedHandler>(handlers).map(
        ([name, handler]) => [`${group.feature}.${name}`, handler]
      )
    );
    const registered = commandsOf(group).map(
      ({ id }): [string, GuardedHandler] => {
        const handler = given.get(id);
        if (handler === undefined) {
          throw new Error(`${id} has no handler`);
        }
        if (this.#handlers.has(id)) {
          throw new Error(`${id} has a handler already`);
        }
        return [id, guardOf(handler)];
      }
    );
    for (const [id, handler] of registered) {
      this.#handlers.set(id, handler);
    }
    return () => {
      for (const [id] of registered) {
        this.#handlers.delete(id);
      }
    };
  };

  /** Whether the command can run now for the window, or with no window when none is given; one nothing handles cannot. */
  enabled(id: Id, windowId?: number): boolean {
    return (
      this.#handlers.get(id)?.when({ windowId: windowId ?? null }) ?? false
    );
  }

  /** Whether the toggle command is on for the window; undefined for a command that is no toggle. */
  checked(id: Id, windowId?: number): boolean | undefined {
    return this.#handlers.get(id)?.checked?.({ windowId: windowId ?? null });
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
