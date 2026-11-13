import {
  close,
  focusNext,
  focusPrevious,
  layout,
  panes,
  ratioAt,
  resize,
  split,
  STYLE_METRICS,
} from "../../../core/engines/layout.ts";
import type {
  Ids,
  Unsubscribe,
  ViewFactoryPort,
  ViewPort,
  WindowPort,
} from "../../../core/ports.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Orientation } from "../../../core/records/layout.ts";
import type { Point, Rect } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { StageSnapshot } from "../../../shared/stage.ts";

export type StageError =
  | "unknownWindow"
  | "unknownPane"
  | "unknownSplit"
  | "lastPane"
  | "failed";

export interface StageOptions {
  readonly window: WindowPort;
  readonly views: ViewFactoryPort;
  readonly ids: Ids;
  readonly group: Group;
  readonly tabs: Map<string, Tab>;
  /** Read on every layout, so a change shows at the next one. */
  readonly style: () => Style;
  /** The zoom of this group's profile. */
  readonly zoom: () => number;
  readonly dragPreload: string | undefined;
  readonly onChange: (snapshot: StageSnapshot) => void;
  readonly onOverlay: (contentsId: number, attached: boolean) => void;
  readonly onError: (error: unknown) => void;
}

interface Drag {
  readonly splitId: string;
  readonly overlay: ViewPort;
}

const TRANSPARENT = "#00000000";

const dragPage = (orientation: Orientation) =>
  `data:text/html,<html style="cursor:${orientation === "vertical" ? "col-resize" : "row-resize"};height:100%"></html>`;

const hostOf = (url: string) => {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
};

export class Stage {
  readonly #options: StageOptions;
  #group: Group;
  readonly #views = new Map<string, ViewPort>();
  readonly #unsubscribe: Unsubscribe[] = [];
  readonly #focusListeners = new Map<string, Unsubscribe>();
  #overlays: ViewPort[] = [];
  #retired: ViewPort[] = [];
  #focused: string | undefined;
  #fullscreen: string | undefined;
  #drag: Drag | undefined;
  #disposed = false;

  constructor(options: StageOptions) {
    this.#options = options;
    this.#group = options.group;
    this.#focused = panes(options.group.layout)[0]?.paneId;
  }

  get group(): Group {
    return this.#group;
  }

  start(): void {
    const { window } = this.#options;
    this.#unsubscribe.push(
      window.onResized(() => {
        this.#arrange();
      }),
      window.onClosed(() => {
        this.dispose();
      })
    );
    this.#update();
  }

  split(
    orientation: Orientation,
    paneId = this.#focused
  ): Result<undefined, StageError> {
    const source = this.#tabOf(paneId);
    if (paneId === undefined || source === undefined) {
      return err("unknownPane");
    }
    const tab: Tab = { ...source, id: this.#options.ids() };
    const result = split(
      this.#group.layout,
      paneId,
      orientation,
      tab.id,
      this.#options.ids
    );
    if (result === undefined) {
      return err("unknownPane");
    }
    this.#options.tabs.set(tab.id, tab);
    this.#group = {
      ...this.#group,
      layout: result.layout,
      tabIds: [...this.#group.tabIds, tab.id],
    };
    this.#update();
    this.focusPane(result.paneId);
    return ok(undefined);
  }

  close(paneId = this.#focused): Result<undefined, StageError> {
    const order = panes(this.#group.layout);
    const index = order.findIndex((pane) => pane.paneId === paneId);
    const closing = order[index];
    if (closing === undefined) {
      return err("unknownPane");
    }
    if (order.length === 1) {
      return err("lastPane");
    }
    const tree = close(this.#group.layout, closing.paneId);
    this.#group = {
      ...this.#group,
      layout: tree,
      tabIds: this.#group.tabIds.filter((id) => !closing.tabIds.includes(id)),
    };
    for (const id of closing.tabIds) {
      this.#options.tabs.delete(id);
    }
    if (this.#fullscreen === closing.paneId) {
      this.#fullscreen = undefined;
    }
    const remaining = panes(tree);
    const next = remaining[Math.min(index, remaining.length - 1)]?.paneId;
    this.#update();
    if (next !== undefined && this.#focused === closing.paneId) {
      this.focusPane(next);
    }
    return ok(undefined);
  }

  resize(splitId: string, ratio: number): Result<undefined, StageError> {
    const tree = resize(this.#group.layout, splitId, ratio);
    if (tree === this.#group.layout) {
      return err("unknownSplit");
    }
    this.#group = { ...this.#group, layout: tree };
    this.#update();
    return ok(undefined);
  }

  focusPane(paneId: string): Result<undefined, StageError> {
    const view = this.#views.get(paneId);
    if (view === undefined) {
      return err("unknownPane");
    }
    this.#focused = paneId;
    view.focus();
    this.#publish();
    return ok(undefined);
  }

  focusNext(): Result<undefined, StageError> {
    return this.#focusBy(focusNext);
  }

  focusPrevious(): Result<undefined, StageError> {
    return this.#focusBy(focusPrevious);
  }

  #focusBy(
    step: (tree: Group["layout"], paneId: string) => string | undefined
  ): Result<undefined, StageError> {
    const target =
      this.#focused === undefined
        ? undefined
        : step(this.#group.layout, this.#focused);
    return target === undefined ? err("unknownPane") : this.focusPane(target);
  }

  setFullscreen(paneId: string | undefined): Result<undefined, StageError> {
    if (paneId !== undefined && !this.#views.has(paneId)) {
      return err("unknownPane");
    }
    this.#fullscreen = paneId;
    this.#update();
    return ok(undefined);
  }

  // Pointer events over a pane go to that pane's renderer, so the chrome page cannot follow a drag across one by itself; a transparent view over every pane catches the pointer for the drag's duration.
  beginDrag(splitId: string): Result<undefined, StageError> {
    const divider = layout(
      this.#group.layout,
      this.#options.window.contentBounds(),
      this.#options.style(),
      this.#fullscreen
    ).dividers.find((found) => found.splitId === splitId);
    if (divider === undefined) {
      return err("unknownSplit");
    }
    this.#retireOverlay();
    const overlay = this.#options.views.create({
      preload: this.#options.dragPreload,
      radius: 0,
      zoom: 1,
    });
    overlay.setBackgroundColor(TRANSPARENT);
    this.#load(overlay, dragPage(divider.orientation));
    this.#drag = { overlay, splitId };
    this.#overlays = [...this.#overlays, overlay];
    this.#options.onOverlay(overlay.contentsId, true);
    this.#reconcile();
    this.#arrange(false);
    return ok(undefined);
  }

  // The chrome page and the overlay both report the pointer, so a move or release after the other source ended the drag is expected and ignored.
  dragTo(point: Point): Result<undefined, StageError> {
    const drag = this.#drag;
    if (drag === undefined) {
      return ok(undefined);
    }
    const bounds = this.#options.window.contentBounds();
    const ratio = ratioAt(
      this.#group.layout,
      bounds,
      this.#options.style(),
      drag.splitId,
      point
    );
    if (ratio === undefined) {
      return err("unknownSplit");
    }
    this.#group = {
      ...this.#group,
      layout: resize(this.#group.layout, drag.splitId, ratio),
    };
    this.#arrange();
    return ok(undefined);
  }

  endDrag(point: Point): Result<undefined, StageError> {
    if (this.#drag === undefined) {
      return ok(undefined);
    }
    this.dragTo(point);
    this.#retireOverlay();
    this.#reconcile();
    return ok(undefined);
  }

  /** Lays the panes out again after the appearance style changed. */
  restyle(): void {
    this.#arrange();
  }

  /** Applies the profile's zoom to every pane after it changed. */
  rezoom(): void {
    const zoom = this.#options.zoom();
    for (const view of this.#views.values()) {
      view.setZoomFactor(zoom);
    }
  }

  /** What each web contents of this stage shows, for a measurement to name its process by. */
  get roles(): { readonly contentsId: number; readonly name: string }[] {
    return [
      { contentsId: this.#options.window.contentsId, name: "chrome page" },
      ...panes(this.#group.layout).flatMap((pane) => {
        const view = this.#views.get(pane.paneId);
        const tab = this.#tabOf(pane.paneId);
        return view === undefined || tab === undefined
          ? []
          : [{ contentsId: view.contentsId, name: `pane ${hostOf(tab.url)}` }];
      }),
      ...this.#overlays.map((overlay) => ({
        contentsId: overlay.contentsId,
        name: "overlay",
      })),
    ];
  }

  get zoomFactors(): number[] {
    return panes(this.#group.layout).flatMap((pane) => {
      const view = this.#views.get(pane.paneId);
      return view === undefined ? [] : [view.zoomFactor()];
    });
  }

  get dragging(): boolean {
    return this.#drag !== undefined;
  }

  snapshot(): StageSnapshot {
    const arrangement = layout(
      this.#group.layout,
      this.#options.window.contentBounds(),
      this.#options.style(),
      this.#fullscreen
    );
    return {
      dividers: [...arrangement.dividers],
      focusedPaneId: this.#focused ?? null,
      panes: [...arrangement.panes].map(([paneId, rect]) => ({
        paneId,
        rect,
      })),
      style: this.#options.style(),
    };
  }

  stack(): ViewPort[] {
    const paneViews = panes(this.#group.layout).flatMap((pane) => {
      const view = this.#views.get(pane.paneId);
      return view === undefined || pane.paneId === this.#fullscreen
        ? []
        : [view];
    });
    const fullscreen =
      this.#fullscreen === undefined
        ? undefined
        : this.#views.get(this.#fullscreen);
    return [
      ...paneViews,
      ...this.#overlays,
      ...(fullscreen === undefined ? [] : [fullscreen]),
    ];
  }

  childBounds(): Rect[] {
    return this.#options.window.childViews().map((view) => view.bounds());
  }

  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const unsubscribe of [
      ...this.#unsubscribe.splice(0),
      ...this.#focusListeners.values(),
    ]) {
      unsubscribe();
    }
    this.#retireOverlay();
    for (const view of [...this.#views.values(), ...this.#retired]) {
      view.destroy();
    }
    this.#views.clear();
    this.#focusListeners.clear();
    this.#retired = [];
  }

  #tabOf(paneId: string | undefined): Tab | undefined {
    const pane = panes(this.#group.layout).find(
      (found) => found.paneId === paneId
    );
    const tabId = pane?.tabIds[0];
    return tabId === undefined ? undefined : this.#options.tabs.get(tabId);
  }

  #load(view: ViewPort, url: string): void {
    const load = async () => {
      try {
        await view.loadURL(url);
      } catch (error) {
        this.#options.onError(error);
      }
    };
    void load();
  }

  #retireOverlay(): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    this.#drag = undefined;
    this.#overlays = this.#overlays.filter((view) => view !== drag.overlay);
    this.#options.onOverlay(drag.overlay.contentsId, false);
    this.#retired.push(drag.overlay);
  }

  #syncViews(): void {
    const wanted = new Map(
      panes(this.#group.layout).map((pane) => [pane.paneId, pane])
    );
    for (const [paneId, view] of this.#views) {
      if (!wanted.has(paneId)) {
        this.#focusListeners.get(paneId)?.();
        this.#focusListeners.delete(paneId);
        this.#views.delete(paneId);
        this.#retired.push(view);
      }
    }
    const { radius } = STYLE_METRICS[this.#options.style()];
    for (const [paneId, pane] of wanted) {
      const tab = this.#tabOf(paneId);
      if (this.#views.has(paneId) || tab === undefined) {
        continue;
      }
      const view = this.#options.views.create({
        partition: `persist:${this.#group.profileId}`,
        radius,
        zoom: this.#options.zoom(),
      });
      this.#focusListeners.set(
        paneId,
        view.onFocus(() => {
          if (this.#focused !== pane.paneId) {
            this.#focused = pane.paneId;
            this.#publish();
          }
        })
      );
      this.#views.set(paneId, view);
      this.#load(view, tab.url);
    }
  }

  // Electron's addChildView moves an attached view to the top whatever index it is given, so a view out of place is removed and inserted again.
  #reconcile(): void {
    const { window } = this.#options;
    const wanted = this.stack();
    for (const view of window.childViews()) {
      if (!wanted.includes(view)) {
        window.removeChildView(view);
      }
    }
    for (const [index, view] of wanted.entries()) {
      const current = window.childViews();
      if (current[index] === view) {
        continue;
      }
      if (current.includes(view)) {
        window.removeChildView(view);
      }
      window.addChildView(view, index);
    }
    for (const view of this.#retired.splice(0)) {
      view.destroy();
    }
  }

  #arrange(publish = true): void {
    const bounds = this.#options.window.contentBounds();
    const arrangement = layout(
      this.#group.layout,
      bounds,
      this.#options.style(),
      this.#fullscreen
    );
    const { radius } = STYLE_METRICS[this.#options.style()];
    for (const [paneId, view] of this.#views) {
      const rect = arrangement.panes.get(paneId);
      if (rect !== undefined) {
        view.setBounds(rect);
      }
      view.setBorderRadius(paneId === this.#fullscreen ? 0 : radius);
    }
    for (const overlay of this.#overlays) {
      overlay.setBounds(bounds);
    }
    if (publish) {
      this.#publish();
    }
  }

  #update(): void {
    this.#syncViews();
    this.#reconcile();
    this.#arrange();
  }

  #publish(): void {
    if (!this.#disposed) {
      this.#options.onChange(this.snapshot());
    }
  }
}
