import type { LogPort } from "../../../core/log.ts";
import type { Unsubscribe, ViewPort, ViewSpec } from "../../../core/ports.ts";
import type { Disposition } from "../../../core/records/link.ts";
import type { PageHistory } from "../../../core/records/navigation.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { CANVAS, loadOwned } from "./owned-view.ts";
import type { OwnedView } from "./owned-view.ts";

/** What a tab's view is made from beyond its profile's partition. */
interface TabSource {
  readonly url: string;
  /** Where the tab's last page stood when it went to sleep, which its view starts at instead of `url`. */
  readonly history?: PageHistory;
  readonly zoom: number;
}

/** The preload a tab's page runs, given by its app, and what its page may ask of main once its view exists. */
export interface ContentPage {
  readonly preload: string;
  /** Extra command-line arguments the preload reads, such as its surface's. */
  readonly arguments: readonly string[];
  /** The view `contentsId` of the tab was made; the returned call is made when it goes. */
  readonly attach: (contentsId: number) => Unsubscribe;
}

interface TabViewsOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  readonly sourceOf: (tab: Tab) => TabSource;
  readonly content?: (tab: Tab) => ContentPage | undefined;
  readonly radius: () => number;
  readonly onFocus: (tabId: string) => void;
  readonly onNavigation: (tabId: string) => void;
  /** A blank popup the tab's page opened navigated to `url`; true shows it. */
  readonly onPopup: (url: string) => boolean;
  /** The tab's page asked for fullscreen, with true, or left it. */
  readonly onFullscreen: (tabId: string, entered: boolean) => void;
  /** Some tab's page started or stopped playing sound. */
  readonly onAudible: () => void;
  /** A link the tab's page opens; true takes it from the page. */
  readonly onOpen: (
    tabId: string,
    url: string,
    disposition: Disposition
  ) => boolean;
  readonly log: LogPort;
}

/** The view of each tab a stage has shown, by tab id, made the first time the tab is shown and retired only once the tab is gone or asleep, so moving a tab between groups, panes or splits, or switching the group a window shows, never reloads its page. */
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

  /** Forgets the tab's view, handing it back for the caller to detach before it disposes it; the tab is given a new one the next time it is shown. */
  release(tabId: string): OwnedView | undefined {
    const owned = this.#views.get(tabId);
    this.#views.delete(tabId);
    return owned;
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
    const { create, onFocus, onFullscreen, onNavigation, onOpen, log } =
      this.#options;
    const source = this.#options.sourceOf(tab);
    const content = this.#options.content?.(tab);
    const owned = create({
      background: CANVAS,
      partition: partitionOf(tab.profileId),
      radius: this.#options.radius(),
      zoom: source.zoom,
      ...(content === undefined
        ? {}
        : { arguments: content.arguments, preload: content.preload }),
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
      view.onPopup(this.#options.onPopup),
      view.onFullscreen((entered) => {
        onFullscreen(tabId, entered);
      }),
      view.onAudible(this.#options.onAudible),
      ...(content === undefined ? [] : [content.attach(view.contentsId)]),
    ];
    void loadOwned(view, source.url, log, source.history);
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
