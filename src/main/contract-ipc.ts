import { isEqual } from "es-toolkit";
import { z } from "zod/mini";

import type { ContractChannels } from "#contract/channels.ts";
import type {
  CallSchemas,
  ContractState,
  SliceSchemas,
  SyncMessage,
} from "#contract/contract.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import { senderFields } from "./senders.ts";
import type { SenderIdentity, SenderRegistry } from "./senders.ts";

/** Each call's handler, answering the renderer what its response holds, nothing for most. */
export type ContractHandlers<Calls extends CallSchemas> = {
  [Name in keyof Calls]: (
    request: z.output<Calls[Name]["request"]>
  ) => z.input<Calls[Name]["response"]> extends undefined
    ? Promise<void>
    : Promise<z.input<Calls[Name]["response"]>>;
};

export interface ContractStateSource<State> {
  read: () => State;
  /** Called after every change of main's state. */
  onChange: (listener: () => void) => void;
}

export interface ContractIpcDeps<
  Calls extends CallSchemas,
  Slices extends SliceSchemas,
  Read extends Partial<ContractState<Slices>> = ContractState<Slices>,
> {
  ipc: Ipc;
  senders: Pick<SenderRegistry, "identify">;
  /** The sender role the renderer is registered under. */
  role: SenderIdentity["role"];
  /** What a refusal calls the renderer, as "the shell". */
  surface: string;
  /** Where its page is served from: its `meru-app://` origin, or the dev server. */
  origin: string;
  calls: Calls;
  slices: Slices;
  channels: ContractChannels<keyof Calls & string>;
  handlers: ContractHandlers<Calls>;
  /**
   * Every slice, unless the caller names a partial `Read`: a slice left out
   * reads as not known yet, as a renderer's does until the first snapshot.
   */
  state: ContractStateSource<NoInfer<Read>>;
  log: Log;
}

export class RefusedCallError extends Error {
  override name = "RefusedCallError";
}

/**
 * Serves a renderer's contract: each call only from the main frame of a
 * webContents of its role on its own origin, with its request validated, and
 * the state slices it subscribes to, as a snapshot when it asks and a patch
 * per slice that changes after.
 */
export const serveContract = <
  Calls extends CallSchemas,
  Slices extends SliceSchemas,
  Read extends Partial<ContractState<Slices>> = ContractState<Slices>,
>({
  ipc,
  senders,
  role,
  surface,
  origin,
  calls,
  slices: sliceSchemas,
  channels,
  handlers,
  state,
  log,
}: ContractIpcDeps<Calls, Slices, Read>) => {
  type State = ContractState<Slices>;
  type SliceName = keyof Slices & string;

  const sliceNames = Object.keys(sliceSchemas) as SliceName[];
  const syncRequest = z.array(z.enum(sliceNames));

  const isOfRole = (webContentsId: number) =>
    senders.identify(webContentsId)?.role === role;

  // A frame the renderer embeds, or a page it navigated to, is not it.
  const isFromRenderer = (sender: IpcSender) =>
    isOfRole(sender.webContentsId) &&
    sender.isMainFrame &&
    sender.origin === origin;

  for (const [name, schemas] of Object.entries(calls)) {
    ipc.handle(
      channels.call(name as keyof Calls & string),
      async (sender, payload) => {
        if (!isFromRenderer(sender)) {
          log("call-refused", {
            call: scrub.token(name),
            role,
            ...senderFields(sender),
          });
          throw new RefusedCallError(`${name} is only for the ${surface}`);
        }

        const request = schemas.request.safeParse(payload);

        if (!request.success) {
          log("call-refused", {
            call: scrub.token(name),
            reason: "malformed",
            error: scrub.error(z.prettifyError(request.error)),
          });
          throw new RefusedCallError(`${name} was malformed`);
        }

        const handler = handlers[name as keyof Calls] as (
          request: unknown
        ) => Promise<unknown>;

        try {
          return await handler(request.data);
        } catch (error) {
          log("call-failed", {
            call: scrub.token(name),
            error: scrub.error(error),
          });
          throw error;
        }
      }
    );
  }

  const subscribers = new Map<number, readonly SliceName[]>();
  let last = state.read();

  const send = (senderId: number, message: SyncMessage<State>) => {
    ipc.send(senderId, channels.state, message);
  };

  ipc.on(channels.sync, (sender, payload) => {
    const requested = syncRequest.safeParse(payload);

    if (!isFromRenderer(sender) || !requested.success) {
      log("handshake-refused", { role, ...senderFields(sender) });

      return;
    }

    const senderId = sender.webContentsId;

    // A renderer that reloads shakes hands again and replaces its
    // subscription.
    subscribers.set(senderId, requested.data);
    send(senderId, {
      kind: "snapshot",
      slices: Object.fromEntries(
        requested.data.map((slice) => [slice, last[slice]])
      ) as Partial<State>,
    });
  });

  state.onChange(() => {
    const next = state.read();
    const changed = sliceNames.filter(
      (slice) => !isEqual(last[slice], next[slice])
    );

    last = next;

    for (const [senderId, subscribed] of subscribers) {
      if (!isOfRole(senderId)) {
        subscribers.delete(senderId);
        continue;
      }

      for (const slice of changed) {
        if (subscribed.includes(slice)) {
          // The value is the named slice's, which TypeScript cannot follow.
          send(senderId, {
            kind: "patch",
            slice,
            value: next[slice],
          } as SyncMessage<State>);
        }
      }
    }
  });
};
