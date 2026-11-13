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
  Unsubscribe,
  ViewFactoryPort,
  ViewPort,
  ViewSpec,
  WindowPort,
} from "../../../core/ports.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Layout, Orientation } from "../../../core/records/layout.ts";
import type { NavigationAction } from "../../../core/records/navigation.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import type { Point } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { Surface } from "../../../shared/channels/define.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import {
  dragSurface,
  overlays,
  surfaceArgument,
} from "../../../shared/channels/surfaces.ts";
import type { OverlayKind } from "../../../shared/channels/surfaces.ts";
import type { Profiles } from "../profiles/index.ts";
import { DragOverlay } from "./drag-overlay.ts";
import { Overlay } from "./overlay.ts";
import { PaneViews } from "./pane-views.ts";
import type { OwnedView, PaneSource } from "./pane-views.ts";

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
  "group" | "tab" | "addTab" | "openTab" | "focusTab" | "closeTab" | "resize"
>;

export interface StageOptions {
  readonly window: WindowPort;
  readonly views: ViewFactoryPort;
  /** Hears the keys typed into one of the stage's views, until the returned call. */
  readonly keys: (view: ViewPort) => Unsubscribe;
  readonly profiles: StageProfiles;
  /** The group the window shows, read again whenever the state may have changed. */
  readonly groupId: () => string | undefined;
  /** The address a pane loads for its tab. */
  readonly urlOf: (tab: Tab) => string;
  /** Read on every layout, so a change shows at the next one. */
  readonly style: () => Style;
  readonly zoom: (profileId: string) => number;
  /** The chrome's ground, which a pane shows until its page paints. */
  readonly background: () => string;
  /** What the chrome takes of the content area, read on every layout. */
  readonly insets: () => ChromeInsets;
  readonly dragPreload: string | undefined;
  /** The preload of an overlay's page, which is one of the renderer's. */
  readonly overlayPreload: string | undefined;
  readonly onChange: (snapshot: StageSnapshot) => void;
  /** An overlay's page came, on the surface its channels are allowed from, or went, with null. */
  readonly onOverlay: (contentsId: number, surface: Surface | null) => void;
  readonly onError: (error: unknown) => void;
}

export class Stage {
  readonly #options: StageOptions;
  readonly #views: PaneViews;
  readonly #disposables = new DisposableStore();
  readonly #overlay: Overlay;
  #shown: Group | undefined;
  readonly #retired: OwnedView[] = [];
  #focused: string | undefined;
  #drag: DragOverlay | undefined;
  #published: StageSnapshot | undefined;

  constructor(options: StageOptions) {
    this.#options = options;
    this.#views = new PaneViews({
      create: (spec) => this.#own(spec),
      onError: options.onError,
      onFocus: (paneId) => {
        if (this.#focused !== paneId) {
          this.#focused = paneId;
          this.#publish();
        }
      },
      onNavigation: (paneId) => {
        if (this.#focused === paneId) {
          this.#publish();
        }
      },
    });
    this.#overlay = new Overlay({
      create: (spec) => this.#own(spec),
      onError: options.onError,
      preload: options.overlayPreload,
    });
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

  /** Splits a pane with a new tab of its own app beside or below it. */
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

  /** Opens a tab of the app in the profile and shows it: beside the focused pane with `split` when the stage shows that profile, else in a group of one; a single-instance app's one tab instead when the profile has it. */
  openTab(
    profileId: string,
    appId: string,
    split: boolean
  ): Result<undefined, StageError> {
    const group = this.#read();
    const paneId = this.#focused;
    const placement =
      split &&
      group !== undefined &&
      paneId !== undefined &&
      group.profileId === profileId
        ? { groupId: group.id, orientation: "vertical" as const, paneId }
        : undefined;
    const { profiles } = this.#options;
    const opened = profiles.openTab(profileId, appId, placement);
    if (!opened.ok) {
      return err("refused");
    }
    return profiles.focusTab(opened.value.id).ok
      ? ok(undefined)
      : err("refused");
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

  focusPane(paneId: string): Result<undefined, StageError> {
    const view = this.#views.view(paneId);
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
      this.#focused === undefined ? undefined : this.#views.view(this.#focused);
    if (view === undefined) {
      return err("unknownPane");
    }
    view.navigate(action);
    return ok(undefined);
  }

  /** Focuses the pane showing the tab, if the stage shows it. */
  focusTab(tabId: string): Result<undefined, StageError> {
    const pane = panes(this.#layout()).find((found) =>
      found.tabIds.includes(tabId)
    );
    return pane === undefined
      ? err("unknownPane")
      : this.focusPane(pane.paneId);
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

  beginDrag(splitId: string): Result<undefined, StageError> {
    const divider = this.#arrangement().dividers.find(
      (found) => found.splitId === splitId
    );
    if (divider === undefined) {
      return err("unknownSplit");
    }
    this.#retireDrag();
    const drag = new DragOverlay({
      create: (spec) => this.#own(spec),
      layout: this.#layout(),
      onError: this.#options.onError,
      orientation: divider.orientation,
      preload: this.#options.dragPreload,
      splitId,
    });
    this.#drag = drag;
    this.#options.onOverlay(drag.view.contentsId, dragSurface);
    this.#reconcile();
    this.#arrange(false);
    return ok(undefined);
  }

  /** Shows a renderer page over the panes until closeOverlay, replacing any overlay already up; its page may use the channels of `surface`. */
  openOverlay(kind: OverlayKind, url: string): void {
    this.#dropOverlay();
    const view = this.#overlay.open(url, [surfaceArgument(kind)]);
    this.#options.onOverlay(view.contentsId, overlays[kind]);
    this.#reconcile();
    this.#arrange(false);
  }

  /** Takes the overlay down and gives the keyboard back to the focused pane. */
  closeOverlay(): void {
    if (this.#overlay.view === undefined) {
      return;
    }
    this.#dropOverlay();
    this.#reconcile();
    if (this.#focused !== undefined) {
      this.#views.view(this.#focused)?.focus();
    }
  }

  // The chrome page and the overlay both report the pointer, so a move or release after the other source ended the drag is expected and ignored.
  dragTo(point: Point): Result<undefined, StageError> {
    const drag = this.#drag;
    if (drag === undefined) {
      return ok(undefined);
    }
    const { area, flush } = this.#area();
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
    this.#retireDrag();
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
    for (const [, view] of this.#views.entries()) {
      view.setZoomFactor(zoom);
    }
  }

  get window(): WindowPort {
    return this.#options.window;
  }

  /** Each pane's view with the tab it shows, in layout order. */
  panes(): { readonly view: ViewPort; readonly tab: Tab }[] {
    return panes(this.#layout()).flatMap((pane) => {
      const view = this.#views.view(pane.paneId);
      const tab = this.#tabOf(pane.paneId);
      return view === undefined || tab === undefined ? [] : [{ tab, view }];
    });
  }

  /** The views over the panes: a drag's, then the overlay's. */
  get overlays(): readonly ViewPort[] {
    return [this.#drag?.view, this.#overlay.view].filter(
      (view) => view !== undefined
    );
  }

  snapshot(): StageSnapshot {
    const arrangement = this.#arrangement();
    return {
      dividers: [...arrangement.dividers],
      focusedPaneId: this.#focused ?? null,
      navigation:
        (this.#focused === undefined
          ? undefined
          : this.#views.view(this.#focused)?.navigation()) ?? null,
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
    this.#retireDrag();
    this.#dropOverlay();
    this.#views.dispose();
    for (const owned of this.#retired.splice(0)) {
      owned.dispose();
    }
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
    const { area, flush } = this.#area();
    return layout(this.#layout(), area, this.#options.style(), flush);
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

  // Every view the stage makes hears the keys typed into it, for the commands without a menu item.
  #own(spec: ViewSpec): OwnedView {
    const view = this.#options.views.create(spec);
    const unkey = this.#options.keys(view);
    return {
      dispose: () => {
        unkey();
        view.destroy();
      },
      view,
    };
  }

  #dropOverlay(): void {
    const overlay = this.#overlay.close();
    if (overlay === undefined) {
      return;
    }
    this.#options.onOverlay(overlay.view.contentsId, null);
    this.#retired.push(overlay);
  }

  #retireDrag(): void {
    const drag = this.#drag;
    if (drag === undefined) {
      return;
    }
    this.#drag = undefined;
    this.#options.onOverlay(drag.view.contentsId, null);
    this.#retired.push(drag.owned);
  }

  /** The source of each pane's view, none for a pane whose tab or group is gone. */
  #sources(): Map<string, PaneSource | undefined> {
    const group = this.#read();
    const { radius } = STYLE_METRICS[this.#options.style()];
    return new Map(
      panes(this.#layout()).map(({ paneId }) => {
        const tab = this.#tabOf(paneId);
        const source =
          group === undefined || tab === undefined
            ? undefined
            : {
                spec: {
                  background: this.#options.background(),
                  partition: partitionOf(group.profileId),
                  radius,
                  zoom: this.#options.zoom(group.profileId),
                },
                url: this.#options.urlOf(tab),
              };
        return [paneId, source];
      })
    );
  }

  #reconcile(): void {
    const { window } = this.#options;
    const wanted = stackOf(
      this.panes().map(({ view }) => view),
      this.overlays
    );
    for (const operation of stackPlan(window.childViews(), wanted)) {
      if (operation.kind === "remove") {
        window.removeChildView(operation.view);
      } else {
        window.addChildView(operation.view, operation.index);
      }
    }
    for (const owned of this.#retired.splice(0)) {
      owned.dispose();
    }
  }

  #arrange(publish = true): void {
    const bounds = this.#options.window.contentBounds();
    const arrangement = this.#arrangement();
    const { radius } = STYLE_METRICS[this.#options.style()];
    for (const [paneId, view] of this.#views.entries()) {
      const rect = arrangement.panes.get(paneId);
      if (rect !== undefined) {
        view.setBounds(rect);
      }
      view.setBorderRadius(radius);
    }
    for (const overlay of this.overlays) {
      overlay.setBounds(bounds);
    }
    if (publish) {
      this.#publish();
    }
  }

  #update(): void {
    this.#retired.push(...this.#views.sync(this.#sources()));
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
