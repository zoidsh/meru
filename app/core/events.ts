import type { Unsubscribe } from "./ports.ts";
import type { Entitlement } from "./records/entitlement.ts";
import type { FeedEntry } from "./records/feed.ts";
import type { Orientation } from "./records/layout.ts";

/** The signals a feature sends up to whoever assembles the app, by name. */
export interface AppEventMap {
  /** What the user may use changed. */
  readonly "entitlement.changed": { readonly entitlement: Entitlement };
  /** What a profile's feed lists changed, its unread count among it. */
  readonly "inbox.changed": null;
  /** A read of a profile's feed found mail that arrived since the last, oldest first. */
  readonly "mail.arrived": {
    readonly profileId: string;
    readonly entries: readonly FeedEntry[];
  };
  /** Something a menu item shows, such as whether it is enabled, may have changed. */
  readonly "menu.invalidated": null;
  /** Another profile is selected, showing `groupId` in the main window. */
  readonly "profile.selected": {
    readonly profileId: string;
    readonly groupId: string;
  };
  /** A tab was asked to come to the front: the main window shows its group, with its pane focused. */
  readonly "tab.focused": { readonly tabId: string; readonly groupId: string };
  /** A group, a tab or the group a window shows may have changed, so every stage reads its group again. */
  readonly "stage.invalidated": null;
  /** The selected profile's sidebar appeared, went or changed width, so the stages lay their panes out again. */
  readonly "sidebar.changed": null;
  /** A split command ran in the window whose chrome page is `windowId`; the launcher asks which app the new pane shows. */
  readonly "split.requested": {
    readonly windowId: number;
    readonly orientation: Orientation;
  };
}

export type AppEventName = keyof AppEventMap;

type Listener<N extends AppEventName> = (payload: AppEventMap[N]) => void;

export class AppEvents {
  readonly #listeners: { readonly [N in AppEventName]: Set<Listener<N>> } = {
    "entitlement.changed": new Set(),
    "inbox.changed": new Set(),
    "mail.arrived": new Set(),
    "menu.invalidated": new Set(),
    "profile.selected": new Set(),
    "sidebar.changed": new Set(),
    "split.requested": new Set(),
    "stage.invalidated": new Set(),
    "tab.focused": new Set(),
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
