import type { z } from "zod";

import { serializeError } from "../../core/errors.ts";
import type { LogPort } from "../../core/log.ts";
import type { IpcTransportPort, Unsubscribe } from "../../core/ports.ts";
import { err } from "../../core/result.ts";
import type { Result } from "../../core/result.ts";
import {
  allowlist,
  eraseHandlers,
  wireName,
} from "../../shared/channels/define.ts";
import type {
  Allowlist,
  Erased,
  Handlers,
  IpcError,
  IpcRegistrar,
  PushChannel,
  RequestChannel,
  Requests,
  Sender,
  Surface,
} from "../../shared/channels/define.ts";

type Bound = (payload: unknown, sender: Sender) => Result<unknown, IpcError>;

const failure = (kind: IpcError["kind"], message: string) =>
  err({ kind, message });

const bind =
  (channel: RequestChannel, handler: Erased): Bound =>
  (payload, sender) => {
    const parsed = channel.payload.safeParse(payload);
    if (!parsed.success) {
      return failure("invalidPayload", parsed.error.message);
    }
    const result = handler(parsed.data, sender);
    return result.ok ? result : failure("failed", result.error);
  };

export class IpcDispatcher implements IpcRegistrar {
  readonly #transport: IpcTransportPort;
  readonly #handlers = new Map<string, Bound>();
  readonly #senders = new Map<
    number,
    { readonly allowed: Allowlist; readonly profileId?: string }
  >();
  readonly #log: LogPort;

  constructor(options: {
    readonly transport: IpcTransportPort;
    readonly log: LogPort;
  }) {
    this.#transport = options.transport;
    this.#log = options.log;
  }

  readonly register = <C extends Requests>(
    channels: C,
    handlers: Handlers<C>
  ): Unsubscribe => {
    const typed: Requests = channels;
    const erased = eraseHandlers(handlers);
    const names = Object.entries(typed).map(([key, channel]) => {
      const handler = erased[key];
      const name = wireName(channel);
      if (handler === undefined) {
        throw new Error(`${name} has no handler`);
      }
      if (this.#handlers.has(name)) {
        throw new Error(`${name} has a handler already`);
      }
      this.#handlers.set(name, bind(channel, handler));
      return name;
    });
    return () => {
      for (const name of names) {
        this.#handlers.delete(name);
      }
    };
  };

  /** Allows the page its surface's channels; a pane's page is assigned its profile, which its requests then carry whatever their payload says. */
  readonly assign = (
    contentsId: number,
    surface: Surface,
    profileId?: string
  ): Unsubscribe => {
    this.#senders.set(contentsId, {
      allowed: allowlist(surface),
      ...(profileId === undefined ? {} : { profileId }),
    });
    return () => {
      this.#senders.delete(contentsId);
    };
  };

  readonly push = <C extends PushChannel>(
    contentsId: number,
    channel: C,
    payload: z.input<C["payload"]>
  ): void => {
    this.#send(contentsId, wireName(channel), payload);
  };

  readonly broadcast = <C extends PushChannel>(
    channel: C,
    payload: z.input<C["payload"]>
  ): void => {
    const name = wireName(channel);
    for (const [contentsId, { allowed }] of this.#senders) {
      if (allowed.push.has(name)) {
        this.#send(contentsId, name, payload);
      }
    }
  };

  #send(contentsId: number, channel: string, payload: unknown): void {
    if (!this.#transport.send(contentsId, channel, payload)) {
      this.#senders.delete(contentsId);
    }
  }

  dispatch(
    contentsId: number,
    channel: string,
    payload: unknown
  ): Result<unknown, IpcError> {
    const sender = this.#senders.get(contentsId);
    if (sender === undefined) {
      return failure("wrongSurface", `Sender ${contentsId} has no surface`);
    }
    const surface = sender.allowed;
    const known =
      surface.event.has(channel) ||
      surface.invoke.has(channel) ||
      surface.sync.has(channel);
    if (!known) {
      return failure(
        "unknownChannel",
        `${channel} is not a channel of this sender's surface`
      );
    }
    const handler = this.#handlers.get(channel);
    if (handler === undefined) {
      return failure("noHandler", `Nothing handles ${channel}`);
    }
    try {
      return handler(payload, {
        contentsId,
        ...(sender.profileId === undefined
          ? {}
          : { profileId: sender.profileId }),
      });
    } catch (error) {
      this.#log.error("A request's handler threw", { channel, error });
      return err({
        error: serializeError(error),
        kind: "threw",
        message: `${channel} threw`,
      });
    }
  }
}
