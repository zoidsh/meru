import { isEqual } from "es-toolkit";

import { DisposableStore } from "../../../core/disposable.ts";
import { stageArea } from "../../../core/engines/chrome.ts";
import type { ChromeInsets } from "../../../core/engines/chrome.ts";
import {
  focusNext,
  focusPrevious,
  layout,
  panes,
  ratioAt,
  resize,
  STYLE_METRICS,
} from "../../../core/engines/layout.ts";
import { stackOf, stackPlan } from "../../../core/engines/stack.ts";
import type {
  NavigationAction,
  Unsubscribe,
  ViewFactoryPort,
  ViewPort,
  WindowPort,
} from "../../../core/ports.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Layout, Orientation } from "../../../core/records/layout.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import type { Point } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import type { Profiles } from "../profiles/index.ts";

export type StageError =
  | "unknownWindow"
  | "unknownPane"
  | "unknownSplit"
  | "lastPane"
  /** The profiles refused the change, such as closing a profile's last Gmail tab. */
  | "refused"
  | "failed";

/** What a stage reads its group and tabs from, and changes them through. */
export type StageProfiles = Pick<
  Profiles,
  "group" | "tab" | "addTab" | "closeTab" | "resize"
>;

export interface StageOptions {
  readonly window: WindowPort;
  readonly views: ViewFactoryPort;
  readonly profiles: StageProfiles;
  /** The group the window shows, read again whenever the state may have changed. */
  readonly groupId: () => string | undefined;
  /** The address a pane loads for its tab. */
  readonly urlOf: (tab: Tab) => string;
  /** Read on every layout, so a change shows at the next one. */
  readonly style: () => Style;
  readonly zoom: (profileId: string) => number;
  /** What the chrome takes of the content area, read on every layout. */
  readonly insets: () => ChromeInsets;
  readonly dragPreload: string | undefined;
  readonly onChange: (snapshot: StageSnapshot) => void;
  readonly onOverlay: (contentsId: number, attached: boolean) => void;
  readonly onError: (error: unknown) => void;
}

interface Drag {
  readonly splitId: string;
  readonly overlay: ViewPort;
  /** The layout as the pointer left it, which the group takes on release. */
  layout: Layout;
  ratio: number | undefined;
}

const TRANSPARENT = "#00000000";

const dragPage = (orientation: Orientation) =>
  `data:text/html,<html style="cursor:${orientation === "vertical" ? "col-resize" : "row-resize"};height:100%"></html>`;

export class Stage {
  readonly #options: StageOptions;
  readonly #views = new Map<string, ViewPort>();
  readonly #disposables = new DisposableStore();
  readonly #focusListeners = new Map<string, Unsubscribe>();
  readonly #navigationListeners = new Map<string, Unsubscribe>();
  #shown: Group | undefined;
  #overlays: ViewPort[] = [];
  #retired: ViewPort[] = [];
  #focused: string | undefined;
  #drag: Drag | undefined;
  #published: StageSnapshot | undefined;

  constructor(options: StageOptions) {
    this.#options = options;
    this.#shown = this.#read();
    this.#focused = panes(this.#layout())[0]?.paneId;
  }

  /** The group the stage shows, as the profiles hold it now. */
  get group(): Group | undefined {
    return this.#read();
  }

  start(): void {
    const { window } = this.#options;
    this.#disposables.add(
      window.onResized(() => {
        this.#arrange();
      }),
      window.onClosed(() => {
        this.dispose();
      })
    );
    this.#update();
  }

  /** Shows the group again if it, or which group the window shows, changed since the stage last looked. */
  refresh(): void {
    const group = this.#read();
    if (this.#disposables.disposed || group === this.#shown) {
      return;
    }
    this.#shown = group;
    const order = panes(this.#layout());
    if (!order.some((pane) => pane.paneId === this.#focused)) {
      this.#focused = order[0]?.paneId;
    }
    this.#update();
  }

  /** Splits a pane with a new tab of the same app beside or below it. */
  split(
    orientation: Orientation,
    paneId = this.#focused
  ): Result<undefined, StageError> {
    const group = this.#read();
    const source = this.#tabOf(paneId);
    if (paneId === undefined || group === undefined || source === undefined) {
      return err("unknownPane");
    }
    const added = this.#options.profiles.addTab(group.profileId, source.appId, {
      groupId: group.id,
      orientation,
      paneId,
    });
    if (!added.ok) {
      return err(added.error === "unknownPane" ? "unknownPane" : "refused");
    }
    this.refresh();
    const pane = panes(this.#layout()).find((found) =>
      found.tabIds.includes(added.value.id)
    );
    return pane === undefined ? ok(undefined) : this.focusPane(pane.paneId);
  }

  /** Closes a pane's tab; the last pane stays. */
  close(paneId = this.#focused): Result<undefined, StageError> {
    const order = panes(this.#layout());
    const index = order.findIndex((pane) => pane.paneId === paneId);
    const closing = order[index];
    const [tabId] = closing?.tabIds ?? [];
    if (closing === undefined || tabId === undefined) {
      return err("unknownPane");
    }
    if (order.length === 1) {
      return err("lastPane");
    }
    const wasFocused = this.#focused === closing.paneId;
    if (!this.#options.profiles.closeTab(tabId).ok) {
      return err("refused");
    }
    this.refresh();
    const remaining = panes(this.#layout());
    const next = remaining[Math.min(index, remaining.length - 1)]?.paneId;
    if (next !== undefined && wasFocused) {
      this.focusPane(next);
    }
    return ok(undefined);
  }

  resize(splitId: string, ratio: number): Result<undefined, StageError> {
    const group = this.#read();
    if (group === undefined) {
      return err("unknownSplit");
    }
    const resized = this.#options.profiles.resize(group.id, splitId, ratio);
    if (!resized.ok) {
      return err(resized.error === "unknownSplit" ? "unknownSplit" : "refused");
    }
    this.refresh();
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

  /** Moves the focused pane through its history, or reloads or stops it. */
  navigate(action: NavigationAction): Result<undefined, StageError> {
    const view =
      this.#focused === undefined ? undefined : this.#views.get(this.#focused);
    if (view === undefined) {
      return err("unknownPane");
    }
    view.navigate(action);
    return ok(undefined);
  }

  focusNext(): Result<undefined, StageError> {
    return this.#focusBy(focusNext);
  }

  focusPrevious(): Result<undefined, StageError> {
    return this.#focusBy(focusPrevious);
  }

  #focusBy(
    step: (tree: Layout, paneId: string) => string | undefined
  ): Result<undefined, StageError> {
    const target =
      this.#focused === undefined
        ? undefined
        : step(this.#layout(), this.#focused);
    return target === undefined ? err("unknownPane") : this.focusPane(target);
  }

  // Pointer events over a pane go to that pane's renderer, so the chrome page cannot follow a drag across one by itself; a transparent view over every pane catches the pointer for the drag's duration.
  beginDrag(splitId: string): Result<undefined, StageError> {
    const divider = this.#arrangement().dividers.find(
      (found) => found.splitId === splitId
    );
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
    this.#drag = { layout: this.#layout(), overlay, ratio: undefined, splitId };
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
    const ratio = ratioAt(
      drag.layout,
      this.#area(),
      this.#options.style(),
      drag.splitId,
      point
    );
    if (ratio === undefined) {
      return err("unknownSplit");
    }
    drag.layout = resize(drag.layout, drag.splitId, ratio);
    drag.ratio = ratio;
    this.#arrange();
    return ok(undefined);
  }

  // The group takes the ratio once, on release, so a drag writes the state once rather than with every move of the pointer.
  endDrag(point: Point): Result<undefined, StageError> {
    const drag = this.#drag;
    if (drag === undefined) {
      return ok(undefined);
    }
    this.dragTo(point);
    this.#retireOverlay();
    const group = this.#read();
    if (drag.ratio !== undefined && group !== undefined) {
      this.#options.profiles.resize(group.id, drag.splitId, drag.ratio);
    }
    this.refresh();
    this.#reconcile();
    return ok(undefined);
  }

  /** Lays the panes out again after the appearance style or the chrome's insets changed. */
  restyle(): void {
    this.#arrange();
  }

  /** Applies the profile's zoom to every pane after it changed. */
  rezoom(): void {
    const group = this.#read();
    if (group === undefined) {
      return;
    }
    const zoom = this.#options.zoom(group.profileId);
    for (const view of this.#views.values()) {
      view.setZoomFactor(zoom);
    }
  }

  get window(): WindowPort {
    return this.#options.window;
  }

  /** Each pane's view with the tab it shows, in layout order. */
  panes(): { readonly view: ViewPort; readonly tab: Tab }[] {
    return panes(this.#layout()).flatMap((pane) => {
      const view = this.#views.get(pane.paneId);
      const tab = this.#tabOf(pane.paneId);
      return view === undefined || tab === undefined ? [] : [{ tab, view }];
    });
  }

  get overlays(): readonly ViewPort[] {
    return this.#overlays;
  }

  snapshot(): StageSnapshot {
    const arrangement = this.#arrangement();
    return {
      dividers: [...arrangement.dividers],
      focusedPaneId: this.#focused ?? null,
      navigation:
        (this.#focused === undefined
          ? undefined
          : this.#views.get(this.#focused)?.navigation()) ?? null,
      panes: [...arrangement.panes].map(([paneId, rect]) => ({
        paneId,
        rect,
      })),
      style: this.#options.style(),
    };
  }

  dispose(): void {
    if (this.#disposables.disposed) {
      return;
    }
    this.#disposables.dispose();
    for (const unsubscribe of [
      ...this.#focusListeners.values(),
      ...this.#navigationListeners.values(),
    ]) {
      unsubscribe();
    }
    this.#navigationListeners.clear();
    this.#retireOverlay();
    for (const view of [...this.#views.values(), ...this.#retired]) {
      view.destroy();
    }
    this.#views.clear();
    this.#focusListeners.clear();
    this.#retired = [];
  }

  #read(): Group | undefined {
    const groupId = this.#options.groupId();
    return groupId === undefined
      ? undefined
      : this.#options.profiles.group(groupId);
  }

  #layout(): Layout {
    return this.#drag?.layout ?? this.#read()?.layout ?? null;
  }

  #arrangement() {
    return layout(this.#layout(), this.#area(), this.#options.style());
  }

  #area() {
    return stageArea(
      this.#options.window.contentBounds(),
      this.#options.insets()
    );
  }

  #tabOf(paneId: string | undefined): Tab | undefined {
    const pane = panes(this.#layout()).find((found) => found.paneId === paneId);
    const [tabId] = pane?.tabIds ?? [];
    return tabId === undefined ? undefined : this.#options.profiles.tab(tabId);
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
    const group = this.#read();
    const wanted = new Map(
      panes(this.#layout()).map((pane) => [pane.paneId, pane])
    );
    for (const [paneId, view] of this.#views) {
      if (!wanted.has(paneId)) {
        this.#focusListeners.get(paneId)?.();
        this.#focusListeners.delete(paneId);
        this.#navigationListeners.get(paneId)?.();
        this.#navigationListeners.delete(paneId);
        this.#views.delete(paneId);
        this.#retired.push(view);
      }
    }
    if (group === undefined) {
      return;
    }
    const { radius } = STYLE_METRICS[this.#options.style()];
    for (const [paneId, pane] of wanted) {
      const tab = this.#tabOf(paneId);
      if (this.#views.has(paneId) || tab === undefined) {
        continue;
      }
      const view = this.#options.views.create({
        partition: partitionOf(group.profileId),
        radius,
        zoom: this.#options.zoom(group.profileId),
      });
      this.#navigationListeners.set(
        paneId,
        view.onNavigation(() => {
          if (this.#focused === pane.paneId) {
            this.#publish();
          }
        })
      );
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
      this.#load(view, this.#options.urlOf(tab));
    }
  }

  #reconcile(): void {
    const { window } = this.#options;
    const wanted = stackOf(
      this.panes().map(({ view }) => view),
      this.#overlays
    );
    for (const operation of stackPlan(window.childViews(), wanted)) {
      if (operation.kind === "remove") {
        window.removeChildView(operation.view);
      } else {
        window.addChildView(operation.view, operation.index);
      }
    }
    for (const view of this.#retired.splice(0)) {
      view.destroy();
    }
  }

  #arrange(publish = true): void {
    const bounds = this.#options.window.contentBounds();
    const arrangement = this.#arrangement();
    const { radius } = STYLE_METRICS[this.#options.style()];
    for (const [paneId, view] of this.#views) {
      const rect = arrangement.panes.get(paneId);
      if (rect !== undefined) {
        view.setBounds(rect);
      }
      view.setBorderRadius(radius);
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

  // A page needs only the stage as it is now, so a snapshot equal to the last one sent is not sent again.
  #publish(): void {
    if (this.#disposables.disposed) {
      return;
    }
    const snapshot = this.snapshot();
    if (!isEqual(snapshot, this.#published)) {
      this.#published = snapshot;
      this.#options.onChange(snapshot);
    }
  }
}
