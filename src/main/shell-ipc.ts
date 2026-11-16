import { isEqual } from "es-toolkit";
import { z } from "zod/mini";

import {
  SHELL_CALL_NAMES,
  SHELL_CALLS,
  SHELL_CHANNELS,
  SHELL_STATE,
} from "#contract/shell.ts";
import type {
  ShellCallName,
  ShellSliceName,
  ShellState,
  ShellSyncMessage,
} from "#contract/shell.ts";
import type { Ipc } from "#platform/ipc.ts";

import type { SenderRegistry } from "./senders.ts";

export type ShellHandlers = {
  [Name in ShellCallName]: (
    request: z.output<(typeof SHELL_CALLS)[Name]["request"]>
  ) => Promise<void>;
};

export interface ShellStateSource {
  read: () => ShellState;
  /** Called after every change of main's state. */
  onChange: (listener: () => void) => void;
}

export interface ShellIpcDeps {
  ipc: Ipc;
  senders: Pick<SenderRegistry, "identify">;
  handlers: ShellHandlers;
  state: ShellStateSource;
  log: (message: string) => void;
}

const SLICE_NAMES = Object.keys(SHELL_STATE) as ShellSliceName[];

const syncRequest = z.array(z.enum(SLICE_NAMES));

export class RefusedCallError extends Error {
  override name = "RefusedCallError";
}

/**
 * Serves the shell contract: each call only from a shell, with its request
 * validated, and the state slices a shell subscribes to, as a snapshot when it
 * asks and a patch per slice that changes after.
 */
export const serveShellContract = ({
  ipc,
  senders,
  handlers,
  state,
  log,
}: ShellIpcDeps) => {
  const isShell = (senderId: number) =>
    senders.identify(senderId)?.role === "shell";

  for (const name of SHELL_CALL_NAMES) {
    ipc.handle(SHELL_CHANNELS.call(name), async (senderId, payload) => {
      if (!isShell(senderId)) {
        log(`Refused ${name} from webContents ${senderId}, which is no shell`);
        throw new RefusedCallError(`${name} is only for the shell`);
      }

      const request = SHELL_CALLS[name].request.safeParse(payload);

      if (!request.success) {
        log(`Refused a malformed ${name}: ${z.prettifyError(request.error)}`);
        throw new RefusedCallError(`${name} was malformed`);
      }

      // Each name's handler takes that name's request.
      const handler = handlers[name] as (request: unknown) => Promise<void>;

      try {
        await handler(request.data);
      } catch (error) {
        log(
          `${name} failed: ${error instanceof Error ? error.message : String(error)}`
        );
        throw error;
      }
    });
  }

  const subscribers = new Map<number, readonly ShellSliceName[]>();
  let last = state.read();

  const send = (senderId: number, message: ShellSyncMessage) => {
    ipc.send(senderId, SHELL_CHANNELS.state, message);
  };

  ipc.on(SHELL_CHANNELS.sync, (senderId, payload) => {
    const slices = syncRequest.safeParse(payload);

    if (!isShell(senderId) || !slices.success) {
      log(`Refused a state handshake from webContents ${senderId}`);

      return;
    }

    // A shell that reloads shakes hands again and replaces its subscription.
    subscribers.set(senderId, slices.data);
    send(senderId, {
      kind: "snapshot",
      slices: Object.fromEntries(
        slices.data.map((slice) => [slice, last[slice]])
      ),
    });
  });

  state.onChange(() => {
    const next = state.read();
    const changed = SLICE_NAMES.filter(
      (slice) => !isEqual(last[slice], next[slice])
    );

    last = next;

    for (const [senderId, slices] of subscribers) {
      // Its webContents is gone.
      if (!isShell(senderId)) {
        subscribers.delete(senderId);
        continue;
      }

      for (const slice of changed) {
        if (slices.includes(slice)) {
          send(senderId, { kind: "patch", slice, value: next[slice] });
        }
      }
    }
  });
};
