import type { z } from "zod";

import type { Unsubscribe } from "../../core/ports.ts";
import { allowlist, wireName } from "../../shared/channels/define.ts";
import type {
  Allowlist,
  EventChannel,
  PushChannel,
  Surface,
  SurfaceEvent,
  SurfacePush,
  SurfaceSync,
  SyncChannel,
} from "../../shared/channels/define.ts";
import { createBridge } from "./bridge-port.ts";
import type { Bridge } from "./bridge-port.ts";

/** A bridge a test drives: it answers a sync channel with what `answer` was given, hands a push to its listeners on `push`, keeps what was sent, and refuses what the real one refuses, being the same bridge over a transport that goes nowhere. */
export class FakeContentBridge<S extends Surface> implements Bridge<S> {
  readonly sent: { readonly channel: string; readonly payload: unknown }[] = [];
  readonly #answers = new Map<string, unknown>();
  readonly #listeners = new Map<string, Set<(payload: unknown) => void>>();
  readonly #bridge: Bridge<S>;

  constructor(surface: S, allowed: Allowlist = allowlist(surface)) {
    this.#bridge = createBridge<S>(allowed, {
      on: (channel, listener) => {
        const listeners = this.#listeners.get(channel) ?? new Set();
        listeners.add(listener);
        this.#listeners.set(channel, listeners);
        return () => {
          listeners.delete(listener);
        };
      },
      send: (channel, payload) => {
        this.sent.push({ channel, payload });
      },
      sendSync: (channel, payload) => {
        this.sent.push({ channel, payload });
        return this.#answers.get(channel);
      },
    });
  }

  readonly send = <P extends z.ZodType>(
    channel: EventChannel<P> & SurfaceEvent<S>,
    payload: z.input<P>
  ): void => {
    this.#bridge.send(channel, payload);
  };

  readonly sendSync = <P extends z.ZodType, R extends z.ZodType>(
    channel: SyncChannel<P, R> & SurfaceSync<S>,
    payload: z.input<P>
  ) => this.#bridge.sendSync(channel, payload);

  readonly on = <P extends z.ZodType>(
    channel: PushChannel<P> & SurfacePush<S>,
    listener: (payload: z.output<P>) => void
  ): Unsubscribe => this.#bridge.on(channel, listener);

  /** What main answers the sync channel with, in the envelope main sends it in. */
  answer<P extends z.ZodType, R extends z.ZodType>(
    channel: SyncChannel<P, R>,
    value: z.input<R>
  ): void {
    this.#answers.set(wireName(channel), { ok: true, value });
  }

  /** Hands the push to whoever listens for it, as main's would arrive. */
  push<P extends z.ZodType>(
    channel: PushChannel<P>,
    payload: z.input<P>
  ): void {
    for (const listener of this.#listeners.get(wireName(channel)) ?? []) {
      listener(payload);
    }
  }

  /** The payloads sent on the channel, oldest first. */
  sentOn<P extends z.ZodType>(
    channel: EventChannel<P> | SyncChannel<P>
  ): unknown[] {
    const name = wireName(channel);
    return this.sent
      .filter((entry) => entry.channel === name)
      .map((entry) => entry.payload);
  }
}
