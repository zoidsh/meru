import type { ViewPort, ViewSpec } from "../../../core/ports.ts";

/** A view the stage made, with what takes it down: the listeners it holds and the view itself. */
export interface OwnedView {
  readonly view: ViewPort;
  readonly dispose: () => void;
}

/** What a pane's view is made from: its spec and the address it loads. */
export interface PaneSource {
  readonly spec: ViewSpec;
  readonly url: string;
}

export interface PaneViewsOptions {
  readonly create: (spec: ViewSpec) => OwnedView;
  readonly onFocus: (paneId: string) => void;
  readonly onNavigation: (paneId: string) => void;
  readonly onError: (error: unknown) => void;
}

/** The view of each pane a stage shows, by pane id: made, loaded and listened to when its pane appears, retired when it goes. */
export class PaneViews {
  readonly #options: PaneViewsOptions;
  readonly #views = new Map<string, OwnedView>();

  constructor(options: PaneViewsOptions) {
    this.#options = options;
  }

  view(paneId: string): ViewPort | undefined {
    return this.#views.get(paneId)?.view;
  }

  /** Each pane's id with its view. */
  entries(): [string, ViewPort][] {
    return [...this.#views].map(([paneId, { view }]) => [paneId, view]);
  }

  /** Keeps the panes `wanted` names, making the view of each that has none from its source, and hands back the views of the panes that went, for the caller to detach before it disposes them. */
  sync(
    wanted: ReadonlyMap<string, PaneSource | undefined>
  ): readonly OwnedView[] {
    const retired: OwnedView[] = [];
    for (const [paneId, owned] of this.#views) {
      if (!wanted.has(paneId)) {
        this.#views.delete(paneId);
        retired.push(owned);
      }
    }
    for (const [paneId, source] of wanted) {
      if (source !== undefined && !this.#views.has(paneId)) {
        this.#views.set(paneId, this.#make(paneId, source));
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

  #make(paneId: string, source: PaneSource): OwnedView {
    const { create, onFocus, onNavigation, onError } = this.#options;
    const owned = create(source.spec);
    const { view } = owned;
    const listeners = [
      view.onNavigation(() => {
        onNavigation(paneId);
      }),
      view.onFocus(() => {
        onFocus(paneId);
      }),
    ];
    const load = async () => {
      try {
        await view.loadURL(source.url);
      } catch (error) {
        onError(error);
      }
    };
    void load();
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
