import type { z } from "zod";

import type { Unsubscribe } from "../../core/ports.ts";
import type { Result } from "../../core/result.ts";
import { eraseHandlers, wireName } from "../../shared/channels/define.ts";
import type {
  Erased,
  Handlers,
  IpcRegistrar,
  PushChannel,
  RequestChannel,
  Requests,
  Surface,
} from "../../shared/channels/define.ts";

export class FakeRegistrar implements IpcRegistrar {
  readonly pushes: {
    readonly contentsId: number;
    readonly channel: string;
    readonly payload: unknown;
  }[] = [];
  readonly surfaces = new Map<number, Surface>();
  readonly #handlers = new Map<string, Erased>();

  readonly register = <C extends Requests>(
    channels: C,
    handlers: Handlers<C>
  ): Unsubscribe => {
    const typed: Requests = channels;
    const erased = eraseHandlers(handlers);
    for (const [key, channel] of Object.entries(typed)) {
      const handler = erased[key];
      if (handler !== undefined) {
        this.#handlers.set(wireName(channel), handler);
      }
    }
    return () => {
      for (const channel of Object.values(typed)) {
        this.#handlers.delete(wireName(channel));
      }
    };
  };

  readonly assign = (contentsId: number, surface: Surface): Unsubscribe => {
    this.surfaces.set(contentsId, surface);
    return () => {
      this.surfaces.delete(contentsId);
    };
  };

  readonly push = <C extends PushChannel>(
    contentsId: number,
    channel: C,
    payload: z.input<C["payload"]>
  ) => {
    this.pushes.push({ channel: wireName(channel), contentsId, payload });
  };

  readonly call = <P extends z.ZodType>(
    channel: RequestChannel & { readonly payload: P },
    payload: z.input<P>,
    contentsId: number
  ): Result<unknown, string> => {
    const handler = this.#handlers.get(wireName(channel));
    if (handler === undefined) {
      throw new Error(`Nothing registered ${wireName(channel)}`);
    }
    return handler(channel.payload.parse(payload), { contentsId });
  };
}
