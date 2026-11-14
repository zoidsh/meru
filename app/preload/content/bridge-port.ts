import type { z } from "zod";

import type { Unsubscribe } from "../../core/ports.ts";
import type { Result } from "../../core/result.ts";
import { settle, wireName } from "../../shared/channels/define.ts";
import type {
  Allowlist,
  EventChannel,
  IpcError,
  PushChannel,
  Surface,
  SurfaceEvent,
  SurfacePush,
  SurfaceSync,
  SyncChannel,
} from "../../shared/channels/define.ts";

/** What carries a channel's name and payload to main; the only thing a content preload's features cannot be tested without. */
export interface BridgeTransport {
  readonly send: (channel: string, payload: unknown) => void;
  readonly sendSync: (channel: string, payload: unknown) => unknown;
  readonly on: (
    channel: string,
    listener: (payload: unknown) => void
  ) => Unsubscribe;
}

// Each method is generic over the channel's schemas rather than the channel, so zod's `output` resolves to them; the intersection keeps the channel to this surface's.
/** What a content preload's features say to main and hear from it, over the channels of one surface and no others. */
export interface Bridge<S extends Surface> {
  readonly send: <P extends z.ZodType>(
    channel: EventChannel<P> & SurfaceEvent<S>,
    payload: z.input<P>
  ) => void;
  readonly sendSync: <P extends z.ZodType, R extends z.ZodType>(
    channel: SyncChannel<P, R> & SurfaceSync<S>,
    payload: z.input<P>
  ) => Result<z.output<R>, IpcError>;
  readonly on: <P extends z.ZodType>(
    channel: PushChannel<P> & SurfacePush<S>,
    listener: (payload: z.output<P>) => void
  ) => Unsubscribe;
}

const refuse = (channel: string): never => {
  throw new Error(`${channel} is not a channel this page may use`);
};

/** A bridge over the transport that refuses every channel outside the allowlist, so a preload loaded into a page main did not give it holds nothing. */
export const createBridge = <S extends Surface>(
  allowed: Allowlist,
  transport: BridgeTransport
): Bridge<S> => ({
  on: <P extends z.ZodType>(
    channel: PushChannel<P>,
    listener: (payload: z.output<P>) => void
  ) => {
    const name = wireName(channel);
    if (!allowed.push.has(name)) {
      refuse(name);
    }
    return transport.on(name, (payload) => {
      const parsed = channel.payload.safeParse(payload);
      if (parsed.success) {
        listener(parsed.data);
      }
    });
  },
  send: <P extends z.ZodType>(
    channel: EventChannel<P>,
    payload: z.input<P>
  ) => {
    const name = wireName(channel);
    if (!allowed.event.has(name)) {
      refuse(name);
    }
    transport.send(name, payload);
  },
  sendSync: <P extends z.ZodType, R extends z.ZodType>(
    channel: SyncChannel<P, R>,
    payload: z.input<P>
  ) => {
    const name = wireName(channel);
    if (!allowed.sync.has(name)) {
      refuse(name);
    }
    return settle<R>(channel.result, transport.sendSync(name, payload));
  },
});
