import type { OnlinePort, Unsubscribe } from "../../core/ports.ts";

export class FakeOnline implements OnlinePort {
  #online: boolean;
  readonly #listeners = new Set<(online: boolean) => void>();

  constructor(online = true) {
    this.#online = online;
  }

  readonly isOnline = () => this.#online;

  readonly onChange = (listener: (online: boolean) => void): Unsubscribe => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  /** Brings the connection up or takes it down, telling whoever listens. */
  readonly set = (online: boolean) => {
    if (online === this.#online) {
      return;
    }
    this.#online = online;
    for (const listener of this.#listeners) {
      listener(online);
    }
  };
}
