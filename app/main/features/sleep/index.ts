import { isEqual } from "es-toolkit";

import { DisposableStore } from "../../../core/disposable.ts";
import { isPinned } from "../../../core/engines/pinned.ts";
import { sweep } from "../../../core/engines/sleep.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { Clock, Unsubscribe } from "../../../core/ports.ts";
import type { PageHistory } from "../../../core/records/navigation.ts";
import { err } from "../../../core/result.ts";
import { isSingleInstanceId } from "../../../shared/apps.ts";
import type {
  CommandContext,
  CommandRegistrar,
} from "../../../shared/commands/define.ts";
import type { Profiles } from "../profiles/index.ts";
import type { SettingsStore } from "../settings/index.ts";
import type { Stages } from "../stage/index.ts";
import { sleepCommands } from "./commands.ts";

const MINUTE = 60_000;

export interface SleepOptions {
  readonly clock: Clock;
  readonly events: Pick<AppEvents, "on">;
  readonly commands: CommandRegistrar;
  readonly profiles: Pick<
    Profiles,
    "asleepChanged" | "letSleep" | "state" | "tab"
  >;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly stages: Pick<Stages, "audible" | "find" | "shown" | "sleep">;
  /** How long a minute of `sleep.afterMinutes` lasts; shorter only for the end-to-end suite. */
  readonly minute?: number;
}

/** Puts to sleep each tab the user let sleep once it has been out of sight for `sleep.afterMinutes`, and marks it awake once a pane shows it again, which loads it anew. */
export class Sleep {
  readonly #options: SleepOptions;
  readonly #disposables = new DisposableStore();
  #idleSince: ReadonlyMap<string, number> = new Map();
  #asleep: ReadonlySet<string> = new Set();
  #timer: Unsubscribe | undefined;
  // Kept only in memory: a sleeping tab whose app quits starts at its stored address next time, as a page would after a restart.
  readonly #histories = new Map<string, PageHistory>();

  constructor(options: SleepOptions) {
    this.#options = options;
  }

  start(): void {
    const { commands, events, settings } = this.#options;
    this.#disposables.add(
      commands.register(sleepCommands, {
        toggleTab: {
          run: (context) => {
            const tab = this.#focusedTab(context);
            return tab === undefined
              ? err("unknownTab")
              : this.#options.profiles.letSleep(tab.id, !tab.sleeps);
          },
          when: (context) => {
            const tab = this.#focusedTab(context);
            return tab !== undefined && !isPinned(tab, isSingleInstanceId);
          },
        },
      }),
      events.on("stage.shown", () => {
        this.#sweep();
      }),
      events.on("tab.audible", () => {
        this.#sweep();
      }),
      settings.subscribe((changes) => {
        if (changes.some((change) => change.key === "sleep.afterMinutes")) {
          this.#sweep();
        }
      }),
      () => {
        this.#timer?.();
      }
    );
    this.#sweep();
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  /** The tabs asleep now. */
  asleep(): ReadonlySet<string> {
    return this.#asleep;
  }

  /** Where the sleeping tab's page stood when it went to sleep, which it wakes at. */
  historyOf(tabId: string): PageHistory | undefined {
    return this.#histories.get(tabId);
  }

  #focusedTab({ windowId }: CommandContext) {
    const snapshot =
      windowId === null
        ? undefined
        : this.#options.stages.find(windowId)?.snapshot();
    const tabId = snapshot?.panes.find(
      (pane) => pane.paneId === snapshot.focusedPaneId
    )?.tabId;
    return tabId === undefined ? undefined : this.#options.profiles.tab(tabId);
  }

  #sweep(): void {
    const { clock, profiles, settings, stages } = this.#options;
    const minute = this.#options.minute ?? MINUTE;
    const plan = sweep({
      after: settings.get("sleep.afterMinutes") * minute,
      asleep: this.#asleep,
      audible: stages.audible(),
      idleSince: this.#idleSince,
      now: clock.now(),
      shown: stages.shown(),
      singleInstance: isSingleInstanceId,
      tabs: profiles.state.tabs,
    });
    for (const tabId of plan.fallAsleep) {
      const history = stages.sleep(tabId);
      if (history !== undefined) {
        this.#histories.set(tabId, history);
      }
    }
    for (const tabId of this.#histories.keys()) {
      if (!plan.asleep.has(tabId)) {
        this.#histories.delete(tabId);
      }
    }
    this.#idleSince = plan.idleSince;
    if (!isEqual(plan.asleep, this.#asleep)) {
      this.#asleep = plan.asleep;
      profiles.asleepChanged();
    }
    this.#timer?.();
    this.#timer =
      plan.next === null
        ? undefined
        : clock.schedule(plan.next - clock.now(), () => {
            this.#timer = undefined;
            this.#sweep();
          });
  }
}
