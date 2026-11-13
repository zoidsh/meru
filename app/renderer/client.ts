import { z } from "zod";

import { BRIDGE_KEY } from "../core/ports.ts";
import type { RendererBridge, Unsubscribe } from "../core/ports.ts";
import { err, ok } from "../core/result.ts";
import type { Result } from "../core/result.ts";
import { ipcErrorSchema, wireName } from "../shared/channels/define.ts";
import type {
  EventChannel,
  InvokeChannel,
  IpcError,
  PushChannel,
  Surface,
  SurfaceEvent,
  SurfaceInvoke,
  SurfacePush,
  SurfaceSync,
  SyncChannel,
} from "../shared/channels/define.ts";

// Each method is generic over the channel's schemas rather than the channel, so zod's `output<this>` resolves to them; the intersection keeps the channel to this surface's.
export interface Client<S extends Surface> {
  readonly platform: string;
  readonly send: <P extends z.ZodType>(
    channel: EventChannel<P> & SurfaceEvent<S>,
    payload: z.input<P>
  ) => void;
  readonly invoke: <P extends z.ZodType, R extends z.ZodType>(
    channel: InvokeChannel<P, R> & SurfaceInvoke<S>,
    payload: z.input<P>
  ) => Promise<Result<z.output<R>, IpcError>>;
  readonly sendSync: <P extends z.ZodType, R extends z.ZodType>(
    channel: SyncChannel<P, R> & SurfaceSync<S>,
    payload: z.input<P>
  ) => Result<z.output<R>, IpcError>;
  readonly on: <P extends z.ZodType>(
    channel: PushChannel<P> & SurfacePush<S>,
    listener: (payload: z.output<P>) => void
  ) => Unsubscribe;
}

const isBridge = (value: unknown): value is RendererBridge =>
  typeof value === "object" &&
  value !== null &&
  "platform" in value &&
  typeof value.platform === "string" &&
  ["send", "invoke", "sendSync", "on"].every(
    (key) => typeof Reflect.get(value, key) === "function"
  );

const envelopeSchema = z.union([
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ error: ipcErrorSchema, ok: z.literal(false) }),
]);

const malformed = (message: string): IpcError => ({
  kind: "invalidPayload",
  message,
});

const settle = <R extends z.ZodType>(
  schema: R,
  answer: unknown
): Result<z.output<R>, IpcError> => {
  const envelope = envelopeSchema.safeParse(answer);
  if (!envelope.success) {
    return err(malformed(envelope.error.message));
  }
  if (!envelope.data.ok) {
    return err(envelope.data.error);
  }
  const value = schema.safeParse(envelope.data.value);
  return value.success ? ok(value.data) : err(malformed(value.error.message));
};

const listen =
  <P extends z.ZodType>(
    schema: P,
    listener: (payload: z.output<P>) => void
  ): ((payload: unknown) => void) =>
  (payload) => {
    const parsed = schema.safeParse(payload);
    if (parsed.success) {
      listener(parsed.data);
    }
  };

export const createClient = <S extends Surface>(
  global: object,
  _surface: S
): Client<S> => {
  const bridge: unknown = Reflect.get(global, BRIDGE_KEY);
  if (!isBridge(bridge)) {
    throw new Error(
      `window.${BRIDGE_KEY} is missing; was the page loaded without the renderer preload?`
    );
  }
  return {
    invoke: async <P extends z.ZodType, R extends z.ZodType>(
      channel: InvokeChannel<P, R>,
      payload: z.input<P>
    ) =>
      settle<R>(
        channel.result,
        await bridge.invoke(wireName(channel), payload)
      ),
    on: <P extends z.ZodType>(
      channel: PushChannel<P>,
      listener: (payload: z.output<P>) => void
    ) => bridge.on(wireName(channel), listen<P>(channel.payload, listener)),
    platform: bridge.platform,
    send: (channel, payload) => {
      bridge.send(wireName(channel), payload);
    },
    sendSync: <P extends z.ZodType, R extends z.ZodType>(
      channel: SyncChannel<P, R>,
      payload: z.input<P>
    ) => settle<R>(channel.result, bridge.sendSync(wireName(channel), payload)),
  };
};
