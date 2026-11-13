import { DisposableStore } from "../../core/disposable.ts";
import {
  matchShortcut,
  resolveBindings,
} from "../../core/engines/shortcuts.ts";
import type { ShortcutCommand } from "../../core/engines/shortcuts.ts";
import type { KeyListener, Unsubscribe } from "../../core/ports.ts";
import type { SettingsStore } from "../features/settings/index.ts";
import type { CommandDispatcher } from "./commands.ts";

export interface ShortcutKeysOptions {
  readonly platform: string;
  /** Every command; only those without a menu placement are heard here. */
  readonly commands: readonly (ShortcutCommand & { readonly menu?: unknown })[];
  readonly dispatcher: Pick<CommandDispatcher, "run" | "enabled">;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly report: (message: string) => void;
}

/**
 * Runs the shortcut of a command that has no menu item, heard on every page main owns before the page sees it.
 * Electron fires an accelerator only for a menu item, and a pane's page never passes a key to the chrome; a command with a menu item is left to the menu, so no key runs twice.
 */
export class ShortcutKeys {
  readonly #options: ShortcutKeysOptions;
  readonly #disposables = new DisposableStore();
  #bindings: ReadonlyMap<string, string | null> = new Map();

  constructor(options: ShortcutKeysOptions) {
    this.#options = options;
  }

  start(): void {
    this.#resolve();
    this.#disposables.add(
      this.#options.settings.subscribe((changes) => {
        if (changes.some((change) => change.key === "shortcuts.bindings")) {
          this.#resolve();
        }
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  /** Hears the keys of a page, whose commands are for the window `windowId` answers. */
  attach(
    source: { readonly onKey: (listener: KeyListener) => Unsubscribe },
    windowId: () => number | undefined
  ): Unsubscribe {
    return source.onKey((input) => {
      const id = matchShortcut(input, this.#bindings, this.#options.platform);
      const window = windowId();
      // A command that cannot run now leaves the key to the page, as Escape is a page's own outside the page it closes.
      if (
        id === undefined ||
        window === undefined ||
        !this.#options.dispatcher.enabled(id, window)
      ) {
        return false;
      }
      const result = this.#options.dispatcher.run(id, { windowId: window });
      if (!result.ok) {
        this.#options.report(`${id}: ${result.error}`);
      }
      return true;
    });
  }

  #resolve(): void {
    this.#bindings = resolveBindings(
      this.#options.commands.filter((command) => command.menu === undefined),
      this.#options.settings.get("shortcuts.bindings")
    );
  }
}
