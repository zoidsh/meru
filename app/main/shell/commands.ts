import type { Unsubscribe } from "../../core/ports.ts";
import { err, ok } from "../../core/result.ts";
import type { Result } from "../../core/result.ts";
import { commands as channels } from "../../shared/channels/commands.ts";
import type { IpcRegistrar } from "../../shared/channels/define.ts";
import { commandsOf, guardOf } from "../../shared/commands/define.ts";
import type {
  CommandContext,
  CommandGroup,
  CommandHandler,
  CommandHandlers,
  GuardedHandler,
  CommandRegistrar,
  CommandSpecs,
} from "../../shared/commands/define.ts";

/** What a window shows, which a command's context carries; undefined asks for the window a command given for none would act on. */
export type ContextOf = (windowId: number | undefined) => CommandContext;

/** The context of a command given while no window is open. */
export const NO_WINDOW: CommandContext = {
  focusedPaneId: null,
  page: "none",
  windowId: -1,
};

const windowOnly: ContextOf = (windowId) =>
  windowId === undefined ? NO_WINDOW : { ...NO_WINDOW, windowId };

/** Holds each command's handler, registered by the feature that declares it, and runs one by id for the menu or a page. */
export class CommandDispatcher implements CommandRegistrar {
  readonly #handlers = new Map<string, GuardedHandler>();
  #contextOf: ContextOf = windowOnly;

  /** Takes what each window shows from `contextOf`, once the windows exist. */
  provide(contextOf: ContextOf): void {
    this.#contextOf = contextOf;
  }

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

  has(id: string): boolean {
    return this.#handlers.has(id);
  }

  /** Whether the command can run now for the window, or for the window a command given for none would act on; one nothing handles cannot. */
  enabled(id: string, windowId?: number): boolean {
    return this.#handlers.get(id)?.when(this.#contextOf(windowId)) ?? false;
  }

  run(
    id: string,
    { windowId }: { readonly windowId: number }
  ): Result<unknown, string> {
    const handler = this.#handlers.get(id);
    const context = this.#contextOf(windowId);
    if (handler === undefined) {
      return err(`Nothing handles ${id}`);
    }
    return handler.when(context)
      ? handler.run(context)
      : err(`${id} cannot run now`);
  }

  /** Answers a page's `commands.run` for the page's own window. */
  start(registrar: IpcRegistrar): Unsubscribe {
    return registrar.register(channels, {
      run: ({ id }, { contentsId }) => {
        const result = this.run(id, { windowId: contentsId });
        return result.ok ? ok(null) : result;
      },
    });
  }
}
