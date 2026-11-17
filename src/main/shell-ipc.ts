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
import type { Ipc, IpcSender } from "#platform/ipc.ts";

import type { SenderRegistry } from "./senders.ts";

export type ShellHandlers = {
  [Name in ShellCallName]: (
    request: z.output<(typeof SHELL_CALLS)[Name]["request"]>
  ) => Promise<void>;
};

interface ShellStateSource {
  read: () => ShellState;
  /** Called after every change of main's state. */
  onChange: (listener: () => void) => void;
}

export interface ShellIpcDeps {
  ipc: Ipc;
  senders: Pick<SenderRegistry, "identify">;
  handlers: ShellHandlers;
  state: ShellStateSource;
  /** Where the shell's page is served from: `meru-app://shell`, or the dev server. */
  shellOrigin: string;
  log: (message: string) => void;
}

const SLICE_NAMES = Object.keys(SHELL_STATE) as ShellSliceName[];

const syncRequest = z.array(z.enum(SLICE_NAMES));

const describeSender = ({ webContentsId, isMainFrame, origin }: IpcSender) =>
  `webContents ${webContentsId} (${isMainFrame ? "main frame" : "subframe"}, ${origin ?? "no origin"})`;

export class RefusedCallError extends Error {
  override name = "RefusedCallError";
}

/**
 * Serves the shell contract: each call only from the main frame of a shell's
 * webContents on the shell's own origin, with its request validated, and the state slices a shell subscribes to, as a snapshot when it
 * asks and a patch per slice that changes after.
 */
export const serveShellContract = ({
  ipc,
  senders,
  handlers,
  state,
  shellOrigin,
  log,
}: ShellIpcDeps) => {
  const isShell = (webContentsId: number) =>
    senders.identify(webContentsId)?.role === "shell";

  // A frame the shell embeds, or a page it navigated to, is not the shell.
  const isFromShell = (sender: IpcSender) =>
    isShell(sender.webContentsId) &&
    sender.isMainFrame &&
    sender.origin === shellOrigin;

  for (const name of SHELL_CALL_NAMES) {
    ipc.handle(SHELL_CHANNELS.call(name), async (sender, payload) => {
      if (!isFromShell(sender)) {
        log(
          `Refused ${name} from ${describeSender(sender)}, which is no shell`
        );
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

  ipc.on(SHELL_CHANNELS.sync, (sender, payload) => {
    const slices = syncRequest.safeParse(payload);

    if (!isFromShell(sender) || !slices.success) {
      log(`Refused a state handshake from ${describeSender(sender)}`);

      return;
    }

    const senderId = sender.webContentsId;

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
          // The value is the named slice's, which TypeScript cannot follow.
          send(senderId, {
            kind: "patch",
            slice,
            value: next[slice],
          } as ShellSyncMessage);
        }
      }
    }
  });
};
