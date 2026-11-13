import { isEqual } from "es-toolkit";

import { DisposableStore } from "../../../core/disposable.ts";
import { stageArea } from "../../../core/engines/chrome.ts";
import type { ChromeInsets } from "../../../core/engines/chrome.ts";
import {
  focusNext,
  focusPrevious,
  layout,
  paneOfTab,
  panes,
  STYLE_METRICS,
  tabOfPane,
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
import type {
  Layout,
  Orientation,
  Placement,
} from "../../../core/records/layout.ts";
import type { NavigationAction } from "../../../core/records/navigation.ts";
import type { Point } from "../../../core/records/rect.ts";
import type { Style } from "../../../core/records/style.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import type { Surface } from "../../../shared/channels/define.ts";
import type { StageSnapshot } from "../../../shared/channels/stage.ts";
import type { OverlayKind } from "../../../shared/channels/surfaces.ts";
import type { Profiles } from "../profiles/index.ts";
import { DragOverlay } from "./drag-overlay.ts";
import { Overlay } from "./overlay.ts";
import type { OwnedView } from "./owned-view.ts";
import { TabViews } from "./tab-views.ts";

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
  readonly #views: TabViews;
  readonly #disposables = new DisposableStore();
  readonly #overlay: Overlay;
  #shown: Group | undefined;
  readonly #retired: OwnedView[] = [];
  /** The tab whose pane has the keyboard. */
  #focused: string | undefined;
  readonly #drag: DragOverlay;
  #published: StageSnapshot | undefined;

  constructor(options: StageOptions) {
    this.#options = options;
    this.#views = new TabViews({
      background: options.background,
      create: (spec) => this.#own(spec),
      onError: options.onError,
      onFocus: (tabId) => {
        if (this.#focused !== tabId) {
          this.#focused = tabId;
          this.#publish();
        }
      },
      onNavigation: (tabId) => {
        if (this.#focused === tabId) {
          this.#publish();
        }
      },
      // Nothing routes a link a pane opens, so each goes on as Chromium would take it.
      onOpen: () => false,
      radius: () => STYLE_METRICS[options.style()].radius,
      sourceOf: (tab) => ({
        url: options.urlOf(tab),
        zoom: options.zoom(tab.profileId),
      }),
    });
    this.#overlay = new Overlay({
      create: (spec) => this.#own(spec),
      onError: options.onError,
      onOverlay: options.onOverlay,
      preload: options.overlayPreload,
      retire: (owned) => {
        this.#retired.push(owned);
      },
    });
    this.#drag = new DragOverlay({
      area: () => this.#area(),
      commit: (splitId, ratio) => {
        const group = this.#read();
        if (group !== undefined) {
          options.profiles.resize(group.id, splitId, ratio);
        }
      },
      create: (spec) => this.#own(spec),
      layout: () => this.#read()?.layout ?? null,
      onError: options.onError,
      onMove: () => {
        this.#arrange();
      },
      onOverlay: options.onOverlay,
      preload: options.dragPreload,
      retire: (owned) => {
        this.#retired.push(owned);
      },
      style: options.style,
    });
    this.#shown = this.#read();
    this.#focused = panes(this.#layout())[0]?.tabIds[0];
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

  /** Shows the group again if it, or which group the window shows, changed since the stage last looked, and lets the views of closed tabs go. */
  refresh(): void {
    if (this.#disposables.disposed) {
      return;
    }
    const group = this.#read();
    if (group === this.#shown) {
      if (this.#retireClosed()) {
        this.#reconcile();
      }
      return;
    }
    this.#shown = group;
    if (this.#focusedPane() === undefined) {
      this.#focused = panes(this.#layout())[0]?.tabIds[0];
    }
    this.#update();
  }

  /** Splits a pane with a new tab of its own app beside or below it. */
  split(
    orientation: Orientation,
    paneId = this.#focusedPane()
  ): Result<undefined, StageError> {
    const placement = this.#placement(orientation, paneId);
    const source = this.#tabOf(placement?.paneId);
    if (placement === undefined || source === undefined) {
      return err("unknownPane");
    }
    const added = this.#options.profiles.addTab(
      source.profileId,
      source.appId,
      placement
    );
    if (!added.ok) {
      return err(added.error === "unknownPane" ? "unknownPane" : "refused");
    }
    this.refresh();
    const shown = paneOfTab(this.#layout(), added.value.id);
    return shown === undefined ? ok(undefined) : this.focusPane(shown);
  }

  /** Opens a tab of the app in the profile and shows it: beside the focused pane with `split` when the stage shows that profile, else in a group of one; a single-instance app's one tab instead when the profile has it. */
  openTab(
    profileId: string,
    appId: string,
    split: boolean
  ): Result<undefined, StageError> {
    const placement =
      split && this.#read()?.profileId === profileId
        ? this.#placement("vertical")
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
  close(paneId = this.#focusedPane()): Result<undefined, StageError> {
    const order = panes(this.#layout());
    const index = order.findIndex((pane) => pane.paneId === paneId);
    const [tabId] = order[index]?.tabIds ?? [];
    if (tabId === undefined) {
      return err("unknownPane");
    }
    if (order.length === 1) {
      return err("lastPane");
    }
    const wasFocused = this.#focused === tabId;
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
    const tabId = tabOfPane(this.#layout(), paneId);
    const view = tabId === undefined ? undefined : this.#views.view(tabId);
    if (view === undefined) {
      return err("unknownPane");
    }
    this.#focused = tabId;
    view.focus();
    this.#publish();
    return ok(undefined);
  }

  /** Moves the focused pane through its history, or reloads or stops it. */
  navigate(action: NavigationAction): Result<undefined, StageError> {
    const view = this.#focusedView();
    if (view === undefined) {
      return err("unknownPane");
    }
    view.navigate(action);
    return ok(undefined);
  }

  /** Focuses the pane showing the tab, if the stage shows it. */
  focusTab(tabId: string): Result<undefined, StageError> {
    const paneId = paneOfTab(this.#layout(), tabId);
    return paneId === undefined ? err("unknownPane") : this.focusPane(paneId);
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
    const focused = this.#focusedPane();
    const target =
      focused === undefined ? undefined : step(this.#layout(), focused);
    return target === undefined ? err("unknownPane") : this.focusPane(target);
  }

  beginDrag(splitId: string): Result<undefined, StageError> {
    const begun = this.#drag.begin(splitId);
    if (!begun.ok) {
      return begun;
    }
    this.#reconcile();
    this.#arrange(false);
    return ok(undefined);
  }

  dragTo(point: Point): Result<undefined, StageError> {
    return this.#drag.move(point);
  }

  endDrag(point: Point): Result<undefined, StageError> {
    const ended = this.#drag.end(point);
    this.refresh();
    this.#reconcile();
    return ended;
  }

  /** Shows a renderer page over the panes until closeOverlay, replacing any overlay already up; its page may use the channels of the `kind`'s surface. */
  openOverlay(kind: OverlayKind, url: string): void {
    this.#overlay.open(kind, url);
    this.#reconcile();
    this.#arrange(false);
  }

  /** Takes the overlay down and gives the keyboard back to the focused pane. */
  closeOverlay(): void {
    if (this.#overlay.view === undefined) {
      return;
    }
    this.#overlay.close();
    this.#reconcile();
    this.#focusedView()?.focus();
  }

  /** Lays the panes out again after the appearance style or the chrome's insets changed. */
  restyle(): void {
    this.#arrange();
  }

  /** Applies each tab's profile's zoom to its view after it changed. */
  rezoom(): void {
    const { profiles, zoom } = this.#options;
    for (const [tabId, view] of this.#views.entries()) {
      const tab = profiles.tab(tabId);
      if (tab !== undefined) {
        view.setZoomFactor(zoom(tab.profileId));
      }
    }
  }

  get window(): WindowPort {
    return this.#options.window;
  }

  /** Each pane's view with the tab it shows, in layout order. */
  panes(): { readonly view: ViewPort; readonly tab: Tab }[] {
    return panes(this.#layout()).flatMap((pane) => {
      const tab = this.#tabOf(pane.paneId);
      const view = tab === undefined ? undefined : this.#views.view(tab.id);
      return view === undefined || tab === undefined ? [] : [{ tab, view }];
    });
  }

  /** The views over the panes: a drag's, then the overlay's. */
  get overlays(): readonly ViewPort[] {
    return [this.#drag.view, this.#overlay.view].filter(
      (view) => view !== undefined
    );
  }

  snapshot(): StageSnapshot {
    const arrangement = this.#arrangement();
    return {
      dividers: [...arrangement.dividers],
      focusedPaneId: this.#focusedPane() ?? null,
      navigation: this.#focusedView()?.navigation() ?? null,
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
    this.#drag.retire();
    this.#overlay.close();
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
    return this.#drag.layout ?? this.#read()?.layout ?? null;
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
    const tabId =
      paneId === undefined ? undefined : tabOfPane(this.#layout(), paneId);
    return tabId === undefined ? undefined : this.#options.profiles.tab(tabId);
  }

  /** The pane showing the focused tab, while the stage shows it. */
  #focusedPane(): string | undefined {
    const focused = this.#focused;
    return focused === undefined
      ? undefined
      : paneOfTab(this.#layout(), focused);
  }

  #focusedView(): ViewPort | undefined {
    return this.#focusedPane() === undefined || this.#focused === undefined
      ? undefined
      : this.#views.view(this.#focused);
  }

  /** Where a tab goes beside or below the pane, the focused one unless named, in the group the stage shows. */
  #placement(
    orientation: Orientation,
    paneId = this.#focusedPane()
  ): Placement | undefined {
    const group = this.#read();
    return group === undefined || paneId === undefined
      ? undefined
      : { groupId: group.id, orientation, paneId, side: "after" };
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

  /** Hands the views of closed tabs, a removed profile's among them, to be detached and disposed. */
  #retireClosed(): boolean {
    const closed = this.#views.retire(
      (tabId) => this.#options.profiles.tab(tabId) !== undefined
    );
    this.#retired.push(...closed);
    return closed.length > 0;
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
    for (const pane of panes(this.#layout())) {
      const [tabId] = pane.tabIds;
      const view = tabId === undefined ? undefined : this.#views.view(tabId);
      const rect = arrangement.panes.get(pane.paneId);
      if (view !== undefined && rect !== undefined) {
        view.setBounds(rect);
        view.setBorderRadius(radius);
      }
    }
    for (const overlay of this.overlays) {
      overlay.setBounds(bounds);
    }
    if (publish) {
      this.#publish();
    }
  }

  #update(): void {
    this.#views.show(
      panes(this.#layout()).flatMap(({ paneId }) => this.#tabOf(paneId) ?? [])
    );
    this.#retireClosed();
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
