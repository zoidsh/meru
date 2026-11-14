import { z } from "zod";

import { serializedErrorSchema } from "../../core/errors.ts";
import type { Unsubscribe } from "../../core/ports.ts";
import { err, ok } from "../../core/result.ts";
import type { Result } from "../../core/result.ts";

export interface EventChannel<P extends z.ZodType = z.ZodType> {
  readonly kind: "event";
  readonly payload: P;
}

export interface InvokeChannel<
  P extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  readonly kind: "invoke";
  readonly payload: P;
  readonly result: R;
}

export interface SyncChannel<
  P extends z.ZodType = z.ZodType,
  R extends z.ZodType = z.ZodType,
> {
  readonly kind: "sync";
  readonly payload: P;
  readonly result: R;
}

export interface PushChannel<P extends z.ZodType = z.ZodType> {
  readonly kind: "push";
  readonly payload: P;
}

export type RequestChannel = EventChannel | InvokeChannel | SyncChannel;

export type Requests = Readonly<Record<string, RequestChannel>>;

type Pushes = Readonly<Record<string, PushChannel>>;

export const event = <P extends z.ZodType>(payload: P): EventChannel<P> => ({
  kind: "event",
  payload,
});

export const invoke = <P extends z.ZodType, R extends z.ZodType>(
  payload: P,
  result: R
): InvokeChannel<P, R> => ({ kind: "invoke", payload, result });

export const sync = <P extends z.ZodType, R extends z.ZodType>(
  payload: P,
  result: R
): SyncChannel<P, R> => ({ kind: "sync", payload, result });

export const push = <P extends z.ZodType>(payload: P): PushChannel<P> => ({
  kind: "push",
  payload,
});

/** The payload of a channel that carries nothing. */
export const noPayload = z.object({});

export type NoPayload = typeof noPayload;

// The channel objects themselves are what callers pass around, so a renamed or reshaped channel breaks every call site at compile time; the wire name is derived once, here.
const wireNames = new WeakMap<object, string>();

const name = <C extends Requests | Pushes>(domain: string, channels: C): C => {
  const all: Readonly<Record<string, RequestChannel | PushChannel>> = channels;
  for (const [key, channel] of Object.entries(all)) {
    if (wireNames.has(channel)) {
      throw new Error(`${domain}.${key} is declared twice`);
    }
    wireNames.set(channel, `${domain}.${key}`);
  }
  return channels;
};

export const defineChannels = <const C extends Requests>(
  domain: string,
  channels: C
): C => name(domain, channels);

export const definePushes = <const C extends Pushes>(
  domain: string,
  channels: C
): C => name(domain, channels);

export const wireName = (channel: RequestChannel | PushChannel): string => {
  const found = wireNames.get(channel);
  if (found === undefined) {
    throw new Error("A channel was used without defineChannels");
  }
  return found;
};

export interface Surface<
  R extends readonly Requests[] = readonly Requests[],
  P extends readonly Pushes[] = readonly Pushes[],
> {
  readonly requests: R;
  readonly pushes: P;
}

export const defineSurface = <
  const R extends readonly Requests[],
  const P extends readonly Pushes[],
>(
  surface: Surface<R, P>
): Surface<R, P> => surface;

// Distributed, because `keyof` of a union of declarations is only the keys they share.
type ChannelsOf<C> = C extends unknown ? C[keyof C] : never;

type SurfaceRequest<S extends Surface> = ChannelsOf<S["requests"][number]>;

export type SurfaceEvent<S extends Surface> = Extract<
  SurfaceRequest<S>,
  EventChannel
>;

export type SurfaceInvoke<S extends Surface> = Extract<
  SurfaceRequest<S>,
  InvokeChannel
>;

export type SurfaceSync<S extends Surface> = Extract<
  SurfaceRequest<S>,
  SyncChannel
>;

export type SurfacePush<S extends Surface> = ChannelsOf<S["pushes"][number]>;

export interface Allowlist {
  readonly event: ReadonlySet<string>;
  readonly invoke: ReadonlySet<string>;
  readonly sync: ReadonlySet<string>;
  readonly push: ReadonlySet<string>;
}

/** Every channel the surfaces allow, by kind. */
export const allowlist = (...given: readonly Surface[]): Allowlist => {
  const sets = {
    event: new Set<string>(),
    invoke: new Set<string>(),
    push: new Set<string>(),
    sync: new Set<string>(),
  };
  const channels: (RequestChannel | PushChannel)[] = given.flatMap(
    (surface) => [
      ...surface.requests.flatMap((group) => Object.values(group)),
      ...surface.pushes.flatMap((group) => Object.values(group)),
    ]
  );
  for (const channel of channels) {
    sets[channel.kind].add(wireName(channel));
  }
  return sets;
};

const ipcErrorSchema = z.object({
  kind: z.enum([
    "unknownChannel",
    "wrongSurface",
    "invalidPayload",
    "noHandler",
    "failed",
    "threw",
  ]),
  message: z.string(),
  /** What a handler threw, which only a `threw` carries. */
  error: serializedErrorSchema.optional(),
});

export type IpcError = z.infer<typeof ipcErrorSchema>;

const envelopeSchema = z.union([
  z.object({ ok: z.literal(true), value: z.unknown() }),
  z.object({ error: ipcErrorSchema, ok: z.literal(false) }),
]);

const malformed = (message: string): IpcError => ({
  kind: "invalidPayload",
  message,
});

/** What a page makes of main's answer: its value parsed by the channel's schema, or the error. */
export const settle = <R extends z.ZodType>(
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

type ValueOf<C extends RequestChannel> =
  C extends InvokeChannel<z.ZodType, infer R>
    ? z.input<R>
    : C extends SyncChannel<z.ZodType, infer S>
      ? z.input<S>
      : undefined;

export interface Sender {
  readonly contentsId: number;
  /** The profile whose pane sent it, for a pane's page; a page of the app's own has none. */
  readonly profileId?: string;
}

type Handler<C extends RequestChannel> = (
  payload: z.output<C["payload"]>,
  sender: Sender
) => Result<ValueOf<C>, string>;

export type Handlers<C extends Requests> = {
  readonly [K in keyof C]: Handler<C[K]>;
};

// A method's parameters are checked bivariantly, which is what lets a map of typed handlers be stored under one erased type; the channel's schema, parsed before every call, is what makes the call sound.
interface ErasedHandler {
  // oxlint-disable-next-line typescript/method-signature-style
  handle(payload: unknown, sender: Sender): Result<unknown, string>;
}

export type Erased = ErasedHandler["handle"];

export const eraseHandlers = <C extends Requests>(
  handlers: Handlers<C>
): Readonly<Record<string, Erased>> => handlers;

export interface IpcRegistrar {
  readonly register: <C extends Requests>(
    channels: C,
    handlers: Handlers<C>
  ) => Unsubscribe;
  readonly assign: (
    contentsId: number,
    surface: Surface,
    profileId?: string
  ) => Unsubscribe;
  readonly push: <C extends PushChannel>(
    contentsId: number,
    channel: C,
    payload: z.input<C["payload"]>
  ) => void;
  /** Pushes to every page whose surface has the channel, and forgets one that is gone. */
  readonly broadcast: <C extends PushChannel>(
    channel: C,
    payload: z.input<C["payload"]>
  ) => void;
}
