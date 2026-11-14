import { isEqual } from "es-toolkit";

import { DisposableStore } from "../../../core/disposable.ts";
import { hasSidebar, sidebarOf } from "../../../core/engines/sidebar.ts";
import type { Sidebar, SidebarSize } from "../../../core/engines/sidebar.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { ok } from "../../../core/result.ts";
import { isSingleInstanceId } from "../../../shared/apps.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { sidebar, sidebarPushes } from "../../../shared/channels/sidebar.ts";
import type { CommandRegistrar } from "../../../shared/commands/define.ts";
import type { Profiles } from "../profiles/index.ts";
import type { SettingsStore } from "../settings/index.ts";
import { sidebarCommands } from "./commands.ts";

export interface SidebarsOptions {
  readonly profiles: Pick<Profiles, "selected" | "state">;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly events: Pick<AppEvents, "on" | "emit">;
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
}

/** Decides the selected profile's sidebar, and holds what the user hid or flipped per profile for as long as the app runs. */
export class Sidebars {
  readonly #options: SidebarsOptions;
  readonly #disposables = new DisposableStore();
  readonly #hidden = new Set<string>();
  readonly #flipped = new Map<string, SidebarSize>();
  #current: Sidebar = { kind: "hidden" };

  constructor(options: SidebarsOptions) {
    this.#options = options;
  }

  start(): void {
    const { events, registrar, commands, settings } = this.#options;
    this.#current = this.#compute();
    this.#disposables.add(
      registrar.register(sidebar, { snapshot: () => ok(this.#current) }),
      commands.register(sidebarCommands, {
        toggle: {
          run: () => {
            this.toggle();
            return ok(null);
          },
          when: () => hasSidebar(this.#tabs()),
        },
        toggleWidth: {
          run: () => {
            this.toggleWidth();
            return ok(null);
          },
          when: () => this.#current.kind === "shown",
        },
      }),
      events.on("stage.invalidated", () => {
        this.#update();
      }),
      settings.subscribe((changes) => {
        if (changes.some((change) => change.key === "sidebar.width")) {
          this.#update();
        }
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  /** The selected profile's sidebar. */
  current(): Sidebar {
    return this.#current;
  }

  /** Hides the selected profile's sidebar, or brings it back. */
  toggle(): void {
    const { id } = this.#options.profiles.selected();
    if (this.#hidden.has(id)) {
      this.#hidden.delete(id);
    } else {
      this.#hidden.add(id);
    }
    this.#update();
  }

  /** Puts the selected profile's sidebar on the width it is not on, until the app quits, leaving the setting alone. */
  toggleWidth(): void {
    const current = this.#current;
    if (current.kind !== "shown") {
      return;
    }
    this.#flipped.set(
      this.#options.profiles.selected().id,
      current.size === "wide" ? "narrow" : "wide"
    );
    this.#update();
  }

  #tabs(): Tab[] {
    const { profiles } = this.#options;
    const { id } = profiles.selected();
    return profiles.state.tabs.filter((tab) => tab.profileId === id);
  }

  #compute(): Sidebar {
    const { profiles, settings } = this.#options;
    const { id } = profiles.selected();
    return sidebarOf(
      this.#tabs(),
      {
        flipped: this.#flipped.get(id),
        hidden: this.#hidden.has(id),
        width: settings.get("sidebar.width", id),
      },
      isSingleInstanceId
    );
  }

  #update(): void {
    const next = this.#compute();
    if (isEqual(next, this.#current)) {
      return;
    }
    this.#current = next;
    this.#options.registrar.broadcast(sidebarPushes.changed, next);
    this.#options.events.emit("sidebar.changed", null);
    this.#options.events.emit("menu.invalidated", null);
  }
}
