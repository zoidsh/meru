import type { AppEvents } from "../../../core/events.ts";
import type {
  Unsubscribe,
  ViewFactoryPort,
  WindowPort,
} from "../../../core/ports.ts";
import type { Orientation } from "../../../core/records/layout.ts";
import type { Point, Rect } from "../../../core/records/rect.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { drag } from "../../../shared/channels/drag.ts";
import { stage, stagePushes } from "../../../shared/channels/stage.ts";
import { dragSurface } from "../../../shared/channels/surfaces.ts";
import type { CommandRegistrar } from "../../../shared/commands/define.ts";
import type { StageSnapshot } from "../../../shared/stage.ts";
import type { SettingsStore } from "../settings/index.ts";
import { stageCommands } from "./commands.ts";
import { Stage } from "./stage.ts";
import type { StageError, StageProfiles } from "./stage.ts";

export type { StageError, StageProfiles } from "./stage.ts";
export { Stage } from "./stage.ts";

export interface StageInspection {
  readonly stage: StageSnapshot;
  readonly views: Rect[];
  readonly zoom: number[];
}

export interface StagesOptions {
  readonly views: ViewFactoryPort;
  readonly profiles: StageProfiles;
  readonly events: AppEvents;
  /** Load `about:blank` in every pane, for the end-to-end suite, which asserts on views and bounds and never on a network page. */
  readonly blankPanes: boolean;
  readonly settings: Pick<SettingsStore, "get" | "subscribe">;
  readonly dragPreload: string | undefined;
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
  readonly onError: (error: unknown) => void;
}

export class Stages {
  readonly #options: StagesOptions;
  readonly #bySender = new Map<number, Stage>();
  readonly #unassign = new Map<number, Unsubscribe>();

  constructor(options: StagesOptions) {
    this.#options = options;
  }

  start(): Unsubscribe {
    const { registrar, settings, commands, events } = this.#options;
    const unregister = [
      events.on("stage.invalidated", () => {
        for (const found of new Set(this.#bySender.values())) {
          found.refresh();
        }
      }),
      commands.register(stageCommands, {
        closeTab: ({ windowId }) => this.close(windowId),
        focusNext: ({ windowId }) => this.focusNext(windowId),
        focusPrevious: ({ windowId }) => this.focusPrevious(windowId),
        splitHorizontal: ({ windowId }) => this.split(windowId, "horizontal"),
        splitVertical: ({ windowId }) => this.split(windowId, "vertical"),
      }),
      settings.subscribe((changes) => {
        const restyle = changes.some(
          (change) => change.key === "appearance.style"
        );
        const rezoom = changes.some((change) => change.key === "stage.zoom");
        for (const found of new Set(this.#bySender.values())) {
          if (restyle) {
            found.restyle();
          }
          if (rezoom) {
            found.rezoom();
          }
        }
      }),
      registrar.register(stage, {
        beginDrag: ({ splitId }, { contentsId }) =>
          this.beginDrag(contentsId, splitId),
        close: ({ paneId }, { contentsId }) => this.close(contentsId, paneId),
        dragTo: ({ x, y, buttons }, { contentsId }) =>
          this.dragTo(contentsId, { x, y }, buttons),
        endDrag: (point, { contentsId }) => this.endDrag(contentsId, point),
        focusPane: ({ paneId }, { contentsId }) =>
          this.focusPane(contentsId, paneId),
        resize: ({ splitId, ratio }, { contentsId }) =>
          this.resize(contentsId, splitId, ratio),
        snapshot: (_payload, { contentsId }) => this.snapshot(contentsId),
        split: ({ orientation, paneId }, { contentsId }) =>
          this.split(contentsId, orientation, paneId),
      }),
      registrar.register(drag, {
        end: (point, { contentsId }) => this.endDrag(contentsId, point),
        move: ({ x, y, buttons }, { contentsId }) =>
          this.dragTo(contentsId, { x, y }, buttons),
      }),
    ];
    return () => {
      for (const remove of unregister) {
        remove();
      }
    };
  }

  /** Opens the stage of a window that shows the group `groupId` names, read again on every change. */
  open(window: WindowPort, groupId: () => string | undefined): Stage {
    const windowId = window.contentsId;
    const { blankPanes, profiles, settings } = this.#options;
    const opened = new Stage({
      dragPreload: this.#options.dragPreload,
      groupId,
      onChange: (snapshot) => {
        this.#options.registrar.push(windowId, stagePushes.changed, snapshot);
      },
      onError: this.#options.onError,
      onOverlay: (contentsId, attached) => {
        if (attached) {
          this.#bySender.set(contentsId, opened);
          this.#unassign.set(
            contentsId,
            this.#options.registrar.assign(contentsId, dragSurface)
          );
        } else {
          this.#bySender.delete(contentsId);
          this.#unassign.get(contentsId)?.();
          this.#unassign.delete(contentsId);
        }
      },
      profiles,
      style: () => settings.get("appearance.style"),
      urlOf: (tab: Tab) => (blankPanes ? "about:blank" : tab.url),
      views: this.#options.views,
      window,
      zoom: (profileId) => settings.get("stage.zoom", profileId),
    });
    this.#bySender.set(windowId, opened);
    window.onClosed(() => {
      for (const [sender, found] of this.#bySender) {
        if (found === opened) {
          this.#bySender.delete(sender);
        }
      }
    });
    opened.start();
    return opened;
  }

  split(
    windowId: number,
    orientation: Orientation,
    paneId?: string
  ): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.split(orientation, paneId));
  }

  close(windowId: number, paneId?: string): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.close(paneId));
  }

  resize(
    windowId: number,
    splitId: string,
    ratio: number
  ): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.resize(splitId, ratio));
  }

  focusPane(windowId: number, paneId: string): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.focusPane(paneId));
  }

  focusNext(windowId: number): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.focusNext());
  }

  focusPrevious(windowId: number): Result<undefined, StageError> {
    return this.#with(windowId, (found) => found.focusPrevious());
  }

  beginDrag(sender: number, splitId: string): Result<undefined, StageError> {
    return this.#with(sender, (found) => found.beginDrag(splitId));
  }

  // Only a release ends a drag: a move with no button held, such as a view reports when it appears under a resting pointer, is ignored rather than taken for one.
  dragTo(
    sender: number,
    point: Point,
    buttons: number
  ): Result<undefined, StageError> {
    return this.#with(sender, (found) =>
      buttons === 0 ? ok(undefined) : found.dragTo(point)
    );
  }

  endDrag(sender: number, point: Point): Result<undefined, StageError> {
    return this.#with(sender, (found) => found.endDrag(point));
  }

  snapshot(sender: number): Result<StageSnapshot, StageError> {
    return this.#with(sender, (found) => ok(found.snapshot()));
  }

  /** What every web contents of every stage shows. */
  roles(): { readonly contentsId: number; readonly name: string }[] {
    return [...new Set(this.#bySender.values())].flatMap(
      (found) => found.roles
    );
  }

  /** What the end-to-end suite asserts on: the stage as held here, the bounds Electron reports for each child view, and each pane's zoom. */
  inspect(sender: number): Result<StageInspection, StageError> {
    return this.#with(sender, (found) =>
      ok({
        stage: found.snapshot(),
        views: found.childBounds(),
        zoom: found.zoomFactors,
      })
    );
  }

  #with<T>(
    sender: number,
    run: (stage: Stage) => Result<T, StageError>
  ): Result<T, StageError> {
    const found = this.#bySender.get(sender);
    if (found === undefined) {
      return err("unknownWindow");
    }
    try {
      return run(found);
    } catch (error) {
      this.#options.onError(error);
      return err("failed");
    }
  }
}
