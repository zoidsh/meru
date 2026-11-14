import { isEqual } from "es-toolkit";
import { z } from "zod";

import { DisposableStore } from "../../../core/disposable.ts";
import { clampToDisplay } from "../../../core/engines/bounds.ts";
import { mainGroupOf } from "../../../core/engines/windows.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { LogPort } from "../../../core/log.ts";
import type {
  LifecyclePort,
  Clock,
  DisplayPort,
  FsPort,
  Ids,
  WindowPort,
} from "../../../core/ports.ts";
import type { Rect } from "../../../core/records/rect.ts";
import { windowSchema } from "../../../core/records/window.ts";
import type { Window } from "../../../core/records/window.ts";
import { SnapshotStore } from "../../../core/snapshot.ts";
import type { Opened, SnapshotSpec } from "../../../core/snapshot.ts";
import type { Profiles } from "../profiles/index.ts";

export const WINDOWS_FILE = "windows.json";

export const windowsStateSchema = z.object({ windows: z.array(windowSchema) });

export type WindowsState = z.infer<typeof windowsStateSchema>;

export const windowsSnapshot: SnapshotSpec<WindowsState, string> = {
  // A window's record only says where it was, so one that cannot be read is dropped and the window opens where a new one would.
  recover: (data) => ({
    fallbacks: data === undefined ? [] : ["windows"],
    value: { windows: [] },
  }),
  migrations: [],
  name: WINDOWS_FILE,
  schema: windowsStateSchema,
  version: 1,
};

export interface WindowsOptions {
  readonly fs: FsPort;
  readonly clock: Clock;
  readonly lifecycle: Pick<LifecyclePort, "onQuit">;
  readonly ids: Ids;
  readonly events: AppEvents;
  readonly displays: DisplayPort;
  readonly profiles: Pick<Profiles, "currentGroup" | "state">;
  readonly log: LogPort;
}

/** Owns windows.json: where each window was and which group it shows. */
export class Windows {
  readonly #options: WindowsOptions;
  readonly #store: SnapshotStore<WindowsState, string>;
  readonly #disposables = new DisposableStore();
  #windows: Window[] = [];

  constructor(options: WindowsOptions) {
    this.#options = options;
    this.#store = new SnapshotStore(windowsSnapshot, {
      lifecycle: options.lifecycle,
      clock: options.clock,
      fs: options.fs,
      log: options.log,
    });
  }

  async open(): Promise<Opened<WindowsState, string>> {
    const opened = await this.#store.open();
    this.#windows = [...opened.value.windows];
    if (opened.fallbacks.length > 0) {
      this.#options.log.warn(
        "The windows file could not be read, so every window opens where a new one would",
        { dropped: opened.fallbacks, file: WINDOWS_FILE }
      );
    }
    return opened;
  }

  start(): void {
    this.#disposables.add(
      () => {
        this.#store.dispose();
      },
      this.#options.events.on("profile.selected", ({ groupId }) => {
        this.#update({ groupId });
      }),
      this.#options.events.on("tab.focused", ({ groupId }) => {
        this.#update({ groupId });
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
  }

  get windows(): readonly Window[] {
    return this.#windows;
  }

  /** Where the main window opens: where it was, on a display that is still there. */
  mainBounds(): Rect {
    return clampToDisplay(
      this.#main()?.bounds,
      this.#options.displays.displays()
    );
  }

  mainGroupId(): string | undefined {
    return mainGroupOf(this.#windows, this.#options.profiles.state);
  }

  /** Follows the main window's moves and resizes, and writes where it was when it closes. */
  attachMain(window: WindowPort): void {
    this.#disposables.add(
      window.onBoundsChanged(() => {
        this.#update({ bounds: window.bounds() });
      }),
      window.onClosed(() => {
        void this.flush();
      })
    );
    this.#update({ bounds: window.bounds() });
  }

  async flush(): Promise<void> {
    await this.#store.flush();
  }

  #main(): Window | undefined {
    return this.#windows.find((window) => window.kind === "main");
  }

  #update(change: Partial<Pick<Window, "bounds" | "groupId">>): void {
    const main = this.#main();
    let next: Window | undefined;
    if (main === undefined) {
      const groupId =
        change.groupId ?? this.#options.profiles.currentGroup()?.id;
      if (groupId === undefined) {
        return;
      }
      next = {
        bounds: change.bounds ?? this.mainBounds(),
        groupId,
        id: this.#options.ids(),
        kind: "main",
      };
    } else {
      next = { ...main, ...change };
      if (isEqual(next, main)) {
        return;
      }
    }
    const updated = next;
    this.#windows = [
      ...this.#windows.filter((window) => window.kind !== "main"),
      updated,
    ];
    this.#store.write({ windows: this.#windows });
  }
}
