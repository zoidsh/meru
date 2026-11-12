import type {
  Ids,
  Unsubscribe,
  ViewFactoryPort,
  WindowPort,
} from "../../../core/ports.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Orientation } from "../../../core/records/layout.ts";
import type { Point, Rect } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import { drag } from "../../../shared/channels/drag.ts";
import { e2e, stage, stagePushes } from "../../../shared/channels/stage.ts";
import { dragSurface } from "../../../shared/channels/surfaces.ts";
import type { StageSnapshot } from "../../../shared/stage.ts";
import { Stage } from "./stage.ts";
import type { StageError } from "./stage.ts";

export type { StageError } from "./stage.ts";
export { Stage } from "./stage.ts";

export interface StagesOptions {
  readonly ids: Ids;
  readonly views: ViewFactoryPort;
  readonly style: Style;
  readonly dragPreload: string | undefined;
  readonly registrar: IpcRegistrar;
  readonly e2e: boolean;
  readonly onError: (error: unknown) => void;
}

export class Stages {
  readonly #options: StagesOptions;
  readonly #tabs = new Map<string, Tab>();
  readonly #bySender = new Map<number, Stage>();
  readonly #unassign = new Map<number, Unsubscribe>();

  constructor(options: StagesOptions) {
    this.#options = options;
  }

  start(): Unsubscribe {
    const { registrar } = this.#options;
    const unregister = [
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
    if (this.#options.e2e) {
      unregister.push(
        registrar.register(e2e, {
          snapshot: (_payload, { contentsId }) =>
            this.#with(contentsId, (found) =>
              ok({ stage: found.snapshot(), views: found.childBounds() })
            ),
        })
      );
    }
    return () => {
      for (const remove of unregister) {
        remove();
      }
    };
  }

  open(window: WindowPort, group: Group, tabs: readonly Tab[]): Stage {
    for (const tab of tabs) {
      this.#tabs.set(tab.id, tab);
    }
    const windowId = window.contentsId;
    const opened = new Stage({
      dragPreload: this.#options.dragPreload,
      group,
      ids: this.#options.ids,
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
      style: this.#options.style,
      tabs: this.#tabs,
      views: this.#options.views,
      window,
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

  beginDrag(sender: number, splitId: string): Result<undefined, StageError> {
    return this.#with(sender, (found) => found.beginDrag(splitId));
  }

  // On macOS the release after a drag across panes reaches neither the chrome page nor the overlay when the overlay is missing, so a move with no button held ends the drag too.
  dragTo(
    sender: number,
    point: Point,
    buttons: number
  ): Result<undefined, StageError> {
    return this.#with(sender, (found) =>
      buttons === 0 ? found.endDrag(point) : found.dragTo(point)
    );
  }

  endDrag(sender: number, point: Point): Result<undefined, StageError> {
    return this.#with(sender, (found) => found.endDrag(point));
  }

  snapshot(sender: number): Result<StageSnapshot, StageError> {
    return this.#with(sender, (found) => ok(found.snapshot()));
  }

  childBounds(sender: number): Result<Rect[], StageError> {
    return this.#with(sender, (found) => ok(found.childBounds()));
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
