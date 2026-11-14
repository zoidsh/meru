import { DisposableStore } from "../../../core/disposable.ts";
import {
  advance,
  canInstall,
  IDLE_UPDATE,
  isBusy,
} from "../../../core/engines/update.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { LogPort } from "../../../core/log.ts";
import type {
  LifecyclePort,
  Clock,
  Unsubscribe,
  UpdaterPort,
} from "../../../core/ports.ts";
import type { UpdateState } from "../../../core/records/update.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import { messageOf } from "../../../core/values.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import {
  updater as channels,
  updaterPushes,
} from "../../../shared/channels/updater.ts";
import type { CommandRegistrar } from "../../../shared/commands/define.ts";
import type { SettingsStore } from "../settings/index.ts";
import { updaterCommands } from "./commands.ts";

export type UpdaterError = "notPackaged" | "notReady";

export interface UpdaterOptions {
  readonly updater: UpdaterPort;
  readonly lifecycle: Pick<LifecyclePort, "packaged">;
  readonly clock: Clock;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
  readonly events: Pick<AppEvents, "emit">;
  readonly log: LogPort;
}

/** How long after the window shows the first check waits, so launch does not share the network with it. */
export const FIRST_CHECK_DELAY = 10_000;

const HOUR = 3_600_000;

/** Checks the release feed behind the window, on a timer, in a packaged app only, and keeps every page told how far an update has got. */
export class Updater {
  readonly #options: UpdaterOptions;
  readonly #disposables = new DisposableStore();
  #state: UpdateState = IDLE_UPDATE;
  #started = false;
  #timer: Unsubscribe | undefined;

  constructor(options: UpdaterOptions) {
    this.#options = options;
  }

  /** Answers pages and the menu from the state as it stands, before the window shows. */
  attach(): void {
    const { registrar, commands, updater } = this.#options;
    this.#disposables.add(
      registrar.register(channels, {
        snapshot: () => ok(this.#state),
      }),
      commands.register(updaterCommands, {
        check: () => this.check(),
        install: {
          run: () => this.install(),
          when: () => canInstall(this.#state),
        },
      }),
      updater.onEvent((event) => {
        this.#set(advance(this.#state, event));
      })
    );
  }

  /** Schedules the first check after the delay and the rest at the user's interval; does nothing in an app run from the repository. */
  start(): void {
    if (!this.#options.lifecycle.packaged) {
      return;
    }
    this.#started = true;
    this.#schedule(FIRST_CHECK_DELAY);
    this.#disposables.add(
      () => {
        this.#started = false;
        this.#timer?.();
        this.#timer = undefined;
      },
      this.#options.settings.subscribe((changes) => {
        if (changes.some((change) => change.key === "updater.channel")) {
          this.check();
        } else if (
          changes.some((change) => change.key === "updater.intervalHours")
        ) {
          this.#schedule(this.#interval());
        }
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  current(): UpdateState {
    return this.#state;
  }

  /** Asks the feed now and restarts the interval; an update found downloads by itself. */
  check(): Result<undefined, UpdaterError> {
    if (!this.#options.lifecycle.packaged) {
      return err("notPackaged");
    }
    if (this.#started) {
      this.#schedule(this.#interval());
    }
    if (!isBusy(this.#state)) {
      void this.#ask(this.#options.settings.get("updater.channel") === "beta");
    }
    return ok(undefined);
  }

  install(): Result<undefined, UpdaterError> {
    if (!canInstall(this.#state)) {
      return err("notReady");
    }
    this.#options.updater.quitAndInstall();
    return ok(undefined);
  }

  async #ask(prerelease: boolean) {
    try {
      await this.#options.updater.checkForUpdates({ prerelease });
    } catch (error) {
      this.#options.log.warn("Could not check for updates", { error });
      this.#set(
        advance(this.#state, {
          kind: "error",
          message: messageOf(error),
        })
      );
    }
  }

  #interval(): number {
    return this.#options.settings.get("updater.intervalHours") * HOUR;
  }

  #schedule(delay: number) {
    this.#timer?.();
    this.#timer = this.#options.clock.schedule(delay, () => {
      this.#timer = undefined;
      this.check();
    });
  }

  #set(state: UpdateState) {
    const previous = this.#state;
    this.#state = state;
    this.#options.registrar.broadcast(updaterPushes.changed, state);
    if (previous.kind !== state.kind) {
      this.#options.events.emit("menu.invalidated", null);
    }
  }
}
