import { isEqual } from "es-toolkit";
import { z } from "zod/mini";

import type { ContractChannels } from "#contract/channels.ts";
import type {
  CallSchemas,
  ContractState,
  SliceSchemas,
  SyncMessage,
} from "#contract/contract.ts";
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import { describeSender } from "./senders.ts";
import type { SenderIdentity, SenderRegistry } from "./senders.ts";

export type ContractHandlers<Calls extends CallSchemas> = {
  [Name in keyof Calls]: (
    request: z.output<Calls[Name]["request"]>
  ) => Promise<void>;
};

export interface ContractStateSource<State> {
  read: () => State;
  /** Called after every change of main's state. */
  onChange: (listener: () => void) => void;
}

export interface ContractIpcDeps<
  Calls extends CallSchemas,
  Slices extends SliceSchemas,
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
  state: ContractStateSource<ContractState<Slices>>;
  log: (message: string) => void;
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
}: ContractIpcDeps<Calls, Slices>) => {
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
          log(
            `Refused ${name} from ${describeSender(sender)}, which is no ${surface}`
          );
          throw new RefusedCallError(`${name} is only for the ${surface}`);
        }

        const request = schemas.request.safeParse(payload);

        if (!request.success) {
          log(`Refused a malformed ${name}: ${z.prettifyError(request.error)}`);
          throw new RefusedCallError(`${name} was malformed`);
        }

        const handler = handlers[name as keyof Calls] as (
          request: unknown
        ) => Promise<void>;

        try {
          await handler(request.data);
        } catch (error) {
          log(
            `${name} failed: ${error instanceof Error ? error.message : String(error)}`
          );
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
      log(`Refused a state handshake from ${describeSender(sender)}`);

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
