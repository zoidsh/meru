import { DisposableStore } from "../../core/disposable.ts";
import {
  matchShortcut,
  resolveBindings,
} from "../../core/engines/shortcuts.ts";
import type { LogPort } from "../../core/log.ts";
import type { Unsubscribe, ViewPort } from "../../core/ports.ts";
import type { Platform } from "../../core/records/platform.ts";
import type { Command } from "../../shared/commands/define.ts";
import type { CommandId } from "../../shared/commands/registry.ts";
import type { SettingsStore } from "../features/settings/index.ts";
import type { CommandDispatcher } from "./commands.ts";

interface ShortcutKeysOptions<Id extends string> {
  readonly platform: Platform;
  /** Every command; only those without a menu placement are heard here. */
  readonly commands: readonly Command<Id>[];
  readonly dispatcher: Pick<CommandDispatcher<Id>, "run" | "enabled">;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly log: LogPort;
}

/** What keys come from: a page main owns. */
type KeySource = Pick<ViewPort, "onKey">;

interface Attached {
  readonly windowId: number;
  off: Unsubscribe | undefined;
}

/**
 * Runs the shortcut of a command that has no menu item, heard on every page main owns before the page sees it.
 * Electron fires an accelerator only for a menu item, and a pane's page never passes a key to the chrome; a command with a menu item is left to the menu, so no key runs twice.
 */
export class ShortcutKeys<Id extends string = CommandId> {
  readonly #options: ShortcutKeysOptions<Id>;
  readonly #disposables = new DisposableStore();
  readonly #sources = new Map<KeySource, Attached>();
  #bindings: ReadonlyMap<Id, string | null> = new Map();

  constructor(options: ShortcutKeysOptions<Id>) {
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
    for (const attached of this.#sources.values()) {
      attached.off?.();
    }
    this.#sources.clear();
  }

  /** Hears the keys of a page whose commands are for the window `windowId`, while any command without a menu item has a key. */
  attach(source: KeySource, windowId: number): Unsubscribe {
    const attached: Attached = { off: undefined, windowId };
    this.#sources.set(source, attached);
    this.#listen(source, attached);
    return () => {
      attached.off?.();
      this.#sources.delete(source);
    };
  }

  #heard(): boolean {
    return [...this.#bindings.values()].some((binding) => binding !== null);
  }

  // Listening costs a hop through the browser process for every key typed into a page, so a page is heard only while there is a key to hear.
  #listen(source: KeySource, attached: Attached): void {
    if (!this.#heard()) {
      attached.off?.();
      attached.off = undefined;
      return;
    }
    attached.off ??= source.onKey((input) => {
      const id = matchShortcut(input, this.#bindings, this.#options.platform);
      // A command that cannot run now leaves the key to the page, as Escape is a page's own outside the page it closes.
      if (
        id === undefined ||
        !this.#options.dispatcher.enabled(id, attached.windowId)
      ) {
        return false;
      }
      const result = this.#options.dispatcher.run(id, {
        windowId: attached.windowId,
      });
      if (!result.ok) {
        this.#options.log.warn("A command refused to run", {
          id,
          reason: result.error,
        });
      }
      return true;
    });
  }

  #resolve(): void {
    this.#bindings = resolveBindings(
      this.#options.commands.filter((command) => command.menu === undefined),
      this.#options.settings.get("shortcuts.bindings"),
      this.#options.platform
    );
    for (const [source, attached] of this.#sources) {
      this.#listen(source, attached);
    }
  }
}
