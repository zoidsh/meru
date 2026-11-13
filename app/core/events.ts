import type { Unsubscribe } from "./ports.ts";
import type { Entitlement } from "./records/entitlement.ts";

/** The signals a feature sends up to whoever assembles the app, by name. */
export interface AppEventMap {
  /** What the user may use changed. */
  readonly "entitlement.changed": { readonly entitlement: Entitlement };
  /** Something a menu item shows, such as whether it is enabled, may have changed. */
  readonly "menu.invalidated": null;
  /** Another profile is selected, showing `groupId` in the main window. */
  readonly "profile.selected": {
    readonly profileId: string;
    readonly groupId: string;
  };
  /** A group, a tab or the group a window shows may have changed, so every stage reads its group again. */
  readonly "stage.invalidated": null;
}

export type AppEventName = keyof AppEventMap;

type Listener<N extends AppEventName> = (payload: AppEventMap[N]) => void;

export class AppEvents {
  readonly #listeners: { readonly [N in AppEventName]: Set<Listener<N>> } = {
    "entitlement.changed": new Set(),
    "menu.invalidated": new Set(),
    "profile.selected": new Set(),
    "stage.invalidated": new Set(),
  };

  on<N extends AppEventName>(name: N, listener: Listener<N>): Unsubscribe {
    const listeners = this.#listeners[name];
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  emit<N extends AppEventName>(name: N, payload: AppEventMap[N]): void {
    for (const listener of this.#listeners[name]) {
      listener(payload);
    }
  }
}
