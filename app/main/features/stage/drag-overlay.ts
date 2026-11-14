import type { StageArea } from "../../../core/engines/chrome.ts";
import { layout, ratioAt, resize } from "../../../core/engines/layout.ts";
import type { LogPort } from "../../../core/log.ts";
import type { ViewPort, ViewSpec } from "../../../core/ports.ts";
import type { Layout, Orientation } from "../../../core/records/layout.ts";
import type { Point } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { Surface } from "../../../shared/channels/define.ts";
import {
  dragSurface,
  overlays,
  surfaceArgument,
} from "../../../shared/channels/surfaces.ts";
import { loadOwned, TRANSPARENT } from "./owned-view.ts";
import type { OwnedView } from "./owned-view.ts";

const dividerPage = (orientation: Orientation) =>
  `data:text/html,<html style="cursor:${orientation === "vertical" ? "col-resize" : "row-resize"};height:100%"></html>`;

export interface DragOverlayOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  /** The preload of a divider drag's page. */
  readonly preload: string | undefined;
  /** The preload of a tab drag's page, which is one of the renderer's. */
  readonly overlayPreload: string | undefined;
  readonly log: LogPort;
  /** The group's layout, which a drag starts from. */
  readonly layout: () => Layout;
  readonly area: () => StageArea;
  readonly style: () => Style;
  /** The drag's view came, on its surface, or went, with null. */
  readonly onOverlay: (contentsId: number, surface: Surface | null) => void;
  /** Hands back a view the drag is done with, for the stage to detach before it disposes it. */
  readonly retire: (owned: OwnedView) => void;
  /** The pointer moved the divider, so the panes are laid out again. */
  readonly onMove: () => void;
  /** The group takes the split's ratio as the drag left it. */
  readonly commit: (splitId: string, ratio: number) => void;
  /** Where the chrome page saw the pointer during a tab drag, for the drag's page to draw. */
  readonly onPointer: (contentsId: number, point: Point) => void;
  /** The tab was let go at the point. */
  readonly drop: (tabId: string, point: Point) => void;
}

type Drag =
  | {
      readonly kind: "divider";
      readonly owned: OwnedView;
      readonly splitId: string;
      readonly layout: Layout;
      readonly ratio: number | undefined;
    }
  | { readonly kind: "tab"; readonly owned: OwnedView; readonly tabId: string };

// Pointer events over a pane go to that pane's renderer, so the chrome page cannot follow a drag across one by itself; a transparent view over every pane catches the pointer for the drag's duration.
/** A stage's drags across the panes, a divider's or a sidebar row's: the view that catches the pointer, the layout as a divider drag left it, which the group takes on release, and the tab a row drag lets go. */
export class DragOverlay {
  readonly #options: DragOverlayOptions;
  #drag: Drag | undefined;

  constructor(options: DragOverlayOptions) {
    this.#options = options;
  }

  /** The layout as the pointer has moved it, while a divider drag is on. */
  get layout(): Layout | undefined {
    return this.#drag?.kind === "divider" ? this.#drag.layout : undefined;
  }

  get view(): ViewPort | undefined {
    return this.#drag?.owned.view;
  }

  // The chrome page and the overlay both report the pointer, so a move or release after the other source ended the drag is expected and ignored.
  move(point: Point): Result<undefined, "unknownSplit"> {
    const drag = this.#drag;
    if (drag === undefined) {
      return ok(undefined);
    }
    if (drag.kind === "tab") {
      this.#options.onPointer(drag.owned.view.contentsId, point);
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

  // The group takes the ratio or the tab once, on release, so a drag writes the state once rather than with every move of the pointer.
  end(point: Point): Result<undefined, "unknownSplit"> {
    const drag = this.#drag;
    if (drag === undefined) {
      return ok(undefined);
    }
    if (drag.kind === "tab") {
      this.retire();
      this.#options.drop(drag.tabId, point);
      return ok(undefined);
    }
    this.move(point);
    const moved = this.#drag;
    this.retire();
    if (moved?.kind === "divider" && moved.ratio !== undefined) {
      this.#options.commit(moved.splitId, moved.ratio);
    }
    return ok(undefined);
  }

  /** Ends the drag, if one is on, without the group taking what it carried. */
  retire(): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    this.#drag = undefined;
    this.#options.onOverlay(drag.owned.view.contentsId, null);
    this.#options.retire(drag.owned);
  }

  /** Starts a divider's drag, ending any drag already on. */
  beginDivider(splitId: string): Result<undefined, "unknownSplit"> {
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
    const { owned } = this.#open(
      dividerPage(divider.orientation),
      this.#options.preload
    );
    this.#drag = {
      kind: "divider",
      layout: base,
      owned,
      ratio: undefined,
      splitId,
    };
    this.#options.onOverlay(owned.view.contentsId, dragSurface);
    return ok(undefined);
  }

  /** Starts a tab's drag over the page at `url`, which draws the tab and where it would land, ending any drag already on. */
  beginTab(tabId: string, url: string): void {
    this.retire();
    const { loaded, owned } = this.#open(url, this.#options.overlayPreload, [
      surfaceArgument("tabDrag"),
    ]);
    this.#drag = { kind: "tab", owned, tabId };
    this.#options.onOverlay(owned.view.contentsId, overlays.tabDrag);
    // Electron leaves the keyboard with the chrome page, where the row was pressed, when a view is added, so the drag's page takes it for its Escape to reach main; focused once loaded, as a view focused before its page exists hands the page no focus.
    const focusLoaded = async () => {
      if ((await loaded) && this.#drag?.owned === owned) {
        owned.view.focus();
      }
    };
    void focusLoaded();
  }

  /** What the drag is of, while one is on. */
  get kind(): "divider" | "tab" | undefined {
    return this.#drag?.kind;
  }

  #open(
    url: string,
    preload: string | undefined,
    args?: readonly string[]
  ): { readonly owned: OwnedView; readonly loaded: Promise<boolean> } {
    const owned = this.#options.create({
      ...(args === undefined ? {} : { arguments: args }),
      background: TRANSPARENT,
      preload,
      radius: 0,
      zoom: 1,
    });
    return {
      loaded: loadOwned(owned.view, url, this.#options.log),
      owned,
    };
  }
}
