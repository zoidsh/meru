import type { StageArea } from "../../../core/engines/chrome.ts";
import { layout, ratioAt, resize } from "../../../core/engines/layout.ts";
import type { ViewPort, ViewSpec } from "../../../core/ports.ts";
import type { Layout, Orientation } from "../../../core/records/layout.ts";
import type { Point } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { Surface } from "../../../shared/channels/define.ts";
import { dragSurface } from "../../../shared/channels/surfaces.ts";
import { loadOwned, TRANSPARENT } from "./owned-view.ts";
import type { OwnedView } from "./owned-view.ts";

const dragPage = (orientation: Orientation) =>
  `data:text/html,<html style="cursor:${orientation === "vertical" ? "col-resize" : "row-resize"};height:100%"></html>`;

export interface DragOverlayOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  readonly preload: string | undefined;
  readonly onError: (error: unknown) => void;
  /** The group's layout, which a drag starts from. */
  readonly layout: () => Layout;
  readonly area: () => StageArea;
  readonly style: () => Style;
  /** The drag's view came, on the drag's surface, or went, with null. */
  readonly onOverlay: (contentsId: number, surface: Surface | null) => void;
  /** Hands back a view the drag is done with, for the stage to detach before it disposes it. */
  readonly retire: (owned: OwnedView) => void;
  /** The pointer moved the divider, so the panes are laid out again. */
  readonly onMove: () => void;
  /** The group takes the split's ratio as the drag left it. */
  readonly commit: (splitId: string, ratio: number) => void;
}

interface Drag {
  readonly splitId: string;
  readonly owned: OwnedView;
  readonly layout: Layout;
  readonly ratio: number | undefined;
}

// Pointer events over a pane go to that pane's renderer, so the chrome page cannot follow a drag across one by itself; a transparent view over every pane catches the pointer for the drag's duration.
/** A stage's divider drags: the view that catches the pointer, and the layout as the pointer left it, which the group takes on release. */
export class DragOverlay {
  readonly #options: DragOverlayOptions;
  #drag: Drag | undefined;

  constructor(options: DragOverlayOptions) {
    this.#options = options;
  }

  /** The layout as the pointer has moved it, while a drag is on. */
  get layout(): Layout | undefined {
    return this.#drag?.layout;
  }

  get view(): ViewPort | undefined {
    return this.#drag?.owned.view;
  }

  /** Starts dragging the split's divider, ending any drag already on. */
  begin(splitId: string): Result<undefined, "unknownSplit"> {
    const { area, flush } = this.#options.area();
    const base = this.#options.layout();
    const divider = layout(
      base,
      area,
      this.#options.style(),
      flush
    ).dividers.find((found) => found.splitId === splitId);
    if (divider === undefined) {
      return err("unknownSplit");
    }
    this.retire();
    const owned = this.#options.create({
      background: TRANSPARENT,
      preload: this.#options.preload,
      radius: 0,
      zoom: 1,
    });
    void loadOwned(
      owned.view,
      dragPage(divider.orientation),
      this.#options.onError
    );
    this.#drag = { layout: base, owned, ratio: undefined, splitId };
    this.#options.onOverlay(owned.view.contentsId, dragSurface);
    return ok(undefined);
  }

  // The chrome page and the overlay both report the pointer, so a move or release after the other source ended the drag is expected and ignored.
  move(point: Point): Result<undefined, "unknownSplit"> {
    const drag = this.#drag;
    if (drag === undefined) {
      return ok(undefined);
    }
    const { area, flush } = this.#options.area();
    const ratio = ratioAt(
      drag.layout,
      area,
      this.#options.style(),
      drag.splitId,
      point,
      flush
    );
    if (ratio === undefined) {
      return err("unknownSplit");
    }
    this.#drag = {
      ...drag,
      layout: resize(drag.layout, drag.splitId, ratio),
      ratio,
    };
    this.#options.onMove();
    return ok(undefined);
  }

  // The group takes the ratio once, on release, so a drag writes the state once rather than with every move of the pointer.
  end(point: Point): Result<undefined, "unknownSplit"> {
    if (this.#drag === undefined) {
      return ok(undefined);
    }
    this.move(point);
    const drag = this.#drag;
    this.retire();
    if (drag.ratio !== undefined) {
      this.#options.commit(drag.splitId, drag.ratio);
    }
    return ok(undefined);
  }

  /** Ends the drag, if one is on, without the group taking its ratio. */
  retire(): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    this.#drag = undefined;
    this.#options.onOverlay(drag.owned.view.contentsId, null);
    this.#options.retire(drag.owned);
  }
}
