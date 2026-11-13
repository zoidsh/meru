import type { Disposition } from "../../../core/engines/links.ts";
import type { ViewPort, ViewSpec } from "../../../core/ports.ts";
import { loadOwned } from "./owned-view.ts";
import type { OwnedView } from "./owned-view.ts";

/** What a tab's view is made from: its spec and the address it loads. */
export interface TabSource {
  readonly spec: ViewSpec;
  readonly url: string;
}

export interface TabViewsOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  readonly onFocus: (tabId: string) => void;
  readonly onNavigation: (tabId: string) => void;
  /** A link the tab's page opens; true takes it from the page. */
  readonly onOpen: (
    tabId: string,
    url: string,
    disposition: Disposition
  ) => boolean;
  readonly onError: (error: unknown) => void;
}

// A view outlives the group its tab is shown in, so moving a tab between groups, panes or splits, or switching the group a window shows, never reloads its page.
/** The view of each tab a stage has shown, by tab id: made, loaded and listened to the first time the tab is shown, retired only once the tab is gone. */
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

  /** Makes the view of each tab `shown` names that has none from its source. */
  show(shown: ReadonlyMap<string, TabSource>): void {
    for (const [tabId, source] of shown) {
      if (!this.#views.has(tabId)) {
        this.#views.set(tabId, this.#make(tabId, source));
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

  #make(tabId: string, source: TabSource): OwnedView {
    const { create, onFocus, onNavigation, onOpen, onError } = this.#options;
    const owned = create(source.spec);
    const { view } = owned;
    const listeners = [
      view.onNavigation(() => {
        onNavigation(tabId);
      }),
      view.onFocus(() => {
        onFocus(tabId);
      }),
      view.onOpen((url, disposition) => onOpen(tabId, url, disposition)),
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
