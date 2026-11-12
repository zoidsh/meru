import type { Ids, ViewFactoryPort, WindowPort } from "../../../core/ports.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Orientation } from "../../../core/records/layout.ts";
import type { Point } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
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
  readonly onChange: (windowId: number, snapshot: StageSnapshot) => void;
  readonly onError: (error: unknown) => void;
}

export class Stages {
  readonly #options: StagesOptions;
  readonly #tabs = new Map<string, Tab>();
  readonly #bySender = new Map<number, Stage>();

  constructor(options: StagesOptions) {
    this.#options = options;
  }

  get style(): Style {
    return this.#options.style;
  }

  open(window: WindowPort, group: Group, tabs: readonly Tab[]): Stage {
    for (const tab of tabs) {
      this.#tabs.set(tab.id, tab);
    }
    const windowId = window.contentsId;
    const stage = new Stage({
      dragPreload: this.#options.dragPreload,
      group,
      ids: this.#options.ids,
      onChange: (snapshot) => {
        this.#options.onChange(windowId, snapshot);
      },
      onError: this.#options.onError,
      onOverlay: (contentsId, attached) => {
        if (attached) {
          this.#bySender.set(contentsId, stage);
        } else {
          this.#bySender.delete(contentsId);
        }
      },
      style: this.#options.style,
      tabs: this.#tabs,
      views: this.#options.views,
      window,
    });
    this.#bySender.set(windowId, stage);
    window.onClosed(() => {
      for (const [sender, found] of this.#bySender) {
        if (found === stage) {
          this.#bySender.delete(sender);
        }
      }
    });
    stage.start();
    return stage;
  }

  split(
    windowId: number,
    orientation: Orientation,
    paneId?: string
  ): Result<void, StageError> {
    return this.#with(windowId, (stage) => stage.split(orientation, paneId));
  }

  close(windowId: number, paneId?: string): Result<void, StageError> {
    return this.#with(windowId, (stage) => stage.close(paneId));
  }

  resize(
    windowId: number,
    splitId: string,
    ratio: number
  ): Result<void, StageError> {
    return this.#with(windowId, (stage) => stage.resize(splitId, ratio));
  }

  focusPane(windowId: number, paneId: string): Result<void, StageError> {
    return this.#with(windowId, (stage) => stage.focusPane(paneId));
  }

  beginDrag(sender: number, splitId: string): Result<void, StageError> {
    return this.#with(sender, (stage) => stage.beginDrag(splitId));
  }

  // On macOS the release after a drag across panes reaches neither the chrome page nor the overlay when the overlay is missing, so a move with no button held ends the drag too.
  dragTo(
    sender: number,
    point: Point,
    buttons: number
  ): Result<void, StageError> {
    return this.#with(sender, (stage) =>
      buttons === 0 ? stage.endDrag(point) : stage.dragTo(point)
    );
  }

  endDrag(sender: number, point: Point): Result<void, StageError> {
    return this.#with(sender, (stage) => stage.endDrag(point));
  }

  snapshot(sender: number): Result<StageSnapshot, StageError> {
    const stage = this.#bySender.get(sender);
    return stage === undefined ? err("unknownWindow") : ok(stage.snapshot());
  }

  #with(
    sender: number,
    run: (stage: Stage) => Result<void, StageError>
  ): Result<void, StageError> {
    const stage = this.#bySender.get(sender);
    if (stage === undefined) {
      return err("unknownWindow");
    }
    try {
      return run(stage);
    } catch (error) {
      this.#options.onError(error);
      return err("failed");
    }
  }
}
