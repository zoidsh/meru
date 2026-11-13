import type { ViewPort, ViewSpec } from "../../../core/ports.ts";
import type { Disposition } from "../../../core/records/link.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { CANVAS, loadOwned } from "./owned-view.ts";
import type { OwnedView } from "./owned-view.ts";

/** What a tab's view is made from beyond its profile's partition. */
export interface TabSource {
  readonly url: string;
  readonly zoom: number;
}

export interface TabViewsOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  readonly sourceOf: (tab: Tab) => TabSource;
  readonly radius: () => number;
  readonly onFocus: (tabId: string) => void;
  readonly onNavigation: (tabId: string) => void;
  /** The tab's page asked for fullscreen, with true, or left it. */
  readonly onFullscreen: (tabId: string, entered: boolean) => void;
  /** A link the tab's page opens; true takes it from the page. */
  readonly onOpen: (
    tabId: string,
    url: string,
    disposition: Disposition
  ) => boolean;
  readonly onError: (error: unknown) => void;
}

/** The view of each tab a stage has shown, by tab id, made the first time the tab is shown and retired only once the tab is gone, so moving a tab between groups, panes or splits, or switching the group a window shows, never reloads its page. */
export class TabViews {
  readonly #options: TabViewsOptions;
  readonly #views = new Map<string, OwnedView>();

  constructor(options: TabViewsOptions) {
    this.#options = options;
  }

  view(tabId: string): ViewPort | undefined {
    return this.#views.get(tabId)?.view;
  }

  /** Each tab's id with its view. */
  entries(): [string, ViewPort][] {
    return [...this.#views].map(([tabId, { view }]) => [tabId, view]);
  }

  /** Makes the view of each tab that has none. */
  show(tabs: readonly Tab[]): void {
    for (const tab of tabs) {
      if (!this.#views.has(tab.id)) {
        this.#views.set(tab.id, this.#make(tab));
      }
    }
  }

  /** Forgets the views of the tabs `exists` no longer knows, handing them back for the caller to detach before it disposes them. */
  retire(exists: (tabId: string) => boolean): readonly OwnedView[] {
    const retired: OwnedView[] = [];
    for (const [tabId, owned] of this.#views) {
      if (!exists(tabId)) {
        this.#views.delete(tabId);
        retired.push(owned);
      }
    }
    return retired;
  }

  dispose(): void {
    for (const owned of this.#views.values()) {
      owned.dispose();
    }
    this.#views.clear();
  }

  #make(tab: Tab): OwnedView {
    const { create, onFocus, onFullscreen, onNavigation, onOpen, onError } =
      this.#options;
    const source = this.#options.sourceOf(tab);
    const owned = create({
      background: CANVAS,
      partition: partitionOf(tab.profileId),
      radius: this.#options.radius(),
      zoom: source.zoom,
    });
    const { view } = owned;
    const tabId = tab.id;
    const listeners = [
      view.onNavigation(() => {
        onNavigation(tabId);
      }),
      view.onFocus(() => {
        onFocus(tabId);
      }),
      view.onOpen((url, disposition) => onOpen(tabId, url, disposition)),
      view.onFullscreen((entered) => {
        onFullscreen(tabId, entered);
      }),
    ];
    void loadOwned(view, source.url, onError);
    return {
      dispose: () => {
        for (const unsubscribe of listeners) {
          unsubscribe();
        }
        owned.dispose();
      },
      view,
    };
  }
}
