import type { RendererBridge, Unsubscribe } from "../../core/ports.ts";
import type { Platform } from "../../core/records/platform.ts";

export class FakeBridge implements RendererBridge {
  readonly platform: Platform;
  readonly sent: { readonly channel: string; readonly payload: unknown }[] = [];
  readonly answers = new Map<string, unknown>();
  readonly #listeners = new Map<string, Set<(payload: unknown) => void>>();

  constructor(platform: Platform = "darwin") {
    this.platform = platform;
  }

  readonly send = (channel: string, payload: unknown) => {
    this.sent.push({ channel, payload });
  };

  readonly invoke = async (channel: string, payload: unknown) => {
    this.sent.push({ channel, payload });
    await Promise.resolve();
    return this.answers.get(channel);
  };

  readonly sendSync = (channel: string, payload: unknown) => {
    this.sent.push({ channel, payload });
    return this.answers.get(channel);
  };

  readonly on = (
    channel: string,
    listener: (payload: unknown) => void
  ): Unsubscribe => {
    const listeners = this.#listeners.get(channel) ?? new Set();
    listeners.add(listener);
    this.#listeners.set(channel, listeners);
    return () => {
      listeners.delete(listener);
    };
  };

  readonly emit = (channel: string, payload: unknown) => {
    for (const listener of this.#listeners.get(channel) ?? []) {
      listener(payload);
    }
  };
}
