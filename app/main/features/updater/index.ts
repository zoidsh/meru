import type { AppEvents } from "../../../core/events.ts";
import type {
  LifecyclePort,
  Clock,
  Unsubscribe,
  UpdaterEvent,
  UpdaterPort,
} from "../../../core/ports.ts";
import type { UpdateState } from "../../../core/records/update.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
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
  readonly onError: (error: unknown) => void;
}

/** How long after the window shows the first check waits, so launch does not share the network with it. */
export const FIRST_CHECK_DELAY = 10_000;

const HOUR = 3_600_000;

const IDLE: UpdateState = { kind: "idle" };

const advance = (state: UpdateState, event: UpdaterEvent): UpdateState => {
  switch (event.kind) {
    case "checking": {
      return { kind: "checking" };
    }
    case "available": {
      return { kind: "available", version: event.version };
    }
    case "notAvailable": {
      return IDLE;
    }
    case "progress": {
      return {
        kind: "downloading",
        percent: Math.min(100, Math.max(0, event.percent)),
      };
    }
    case "downloaded": {
      return { kind: "ready", version: event.version };
    }
    case "error": {
      // A downloaded update still installs on quit whatever a later check runs into.
      return state.kind === "ready"
        ? state
        : { kind: "error", message: event.message };
    }
    default: {
      return state;
    }
  }
};

/** Checks the release feed behind the window, on a timer, in a packaged app only, and keeps every page told how far an update has got. */
export class Updater {
  readonly #options: UpdaterOptions;
  readonly #pages = new Set<number>();
  #state: UpdateState = IDLE;
  #started = false;
  #timer: Unsubscribe | undefined;

  constructor(options: UpdaterOptions) {
    this.#options = options;
  }

  /** Answers pages and the menu from the state as it stands, before the window shows. */
  attach(): Unsubscribe {
    const { registrar, commands, updater } = this.#options;
    const unsubscribe = [
      registrar.register(channels, {
        snapshot: (_payload, { contentsId }) => {
          this.#pages.add(contentsId);
          return ok(this.#state);
        },
      }),
      commands.register(updaterCommands, {
        check: () => this.check(),
        install: {
          run: () => this.install(),
          when: () => this.#state.kind === "ready",
        },
      }),
      updater.onEvent((event) => {
        this.#set(advance(this.#state, event));
      }),
    ];
    return () => {
      for (const remove of unsubscribe) {
        remove();
      }
      this.#pages.clear();
    };
  }

  /** Schedules the first check after the delay and the rest at the user's interval; does nothing in an app run from the repository. */
  start(): Unsubscribe {
    const unsubscribe: Unsubscribe[] = [];
    if (this.#options.lifecycle.packaged) {
      this.#started = true;
      this.#schedule(FIRST_CHECK_DELAY);
      unsubscribe.push(
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
    return () => {
      for (const remove of unsubscribe) {
        remove();
      }
      this.#started = false;
      this.#timer?.();
      this.#timer = undefined;
    };
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
    const busy =
      this.#state.kind === "downloading" || this.#state.kind === "ready";
    if (!busy) {
      void this.#ask(this.#options.settings.get("updater.channel") === "beta");
    }
    return ok(undefined);
  }

  install(): Result<undefined, UpdaterError> {
    if (this.#state.kind !== "ready") {
      return err("notReady");
    }
    this.#options.updater.quitAndInstall();
    return ok(undefined);
  }

  async #ask(prerelease: boolean) {
    try {
      await this.#options.updater.checkForUpdates({ prerelease });
    } catch (error) {
      this.#set(
        advance(this.#state, {
          kind: "error",
          message: error instanceof Error ? error.message : String(error),
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
    for (const contentsId of this.#pages) {
      this.#options.registrar.push(contentsId, updaterPushes.changed, state);
    }
    if (previous.kind !== state.kind) {
      this.#options.events.emit("menu.invalidated", null);
    }
  }
}
