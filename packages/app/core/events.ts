import type { Unsubscribe } from "./ports.ts";
import type { Entitlement } from "./records/entitlement.ts";

/** The signals a feature sends up to whoever assembles the app, by name. */
export interface AppEventMap {
  /** What the user may use changed; `reason` is the server's when the license was disabled. */
  readonly "entitlement.changed": {
    readonly entitlement: Entitlement;
    readonly reason: string | null;
  };
}

export type AppEventName = keyof AppEventMap;

type Listener<N extends AppEventName> = (payload: AppEventMap[N]) => void;

export class AppEvents {
  readonly #listeners: { readonly [N in AppEventName]: Set<Listener<N>> } = {
    "entitlement.changed": new Set(),
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
