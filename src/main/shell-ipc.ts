import type { SHELL_ENTITLEMENT_CALL_NAMES } from "#contract/entitlement-channels.ts";
import {
  SHELL_CALL_NAMES,
  SHELL_CALLS,
  SHELL_CHANNELS,
  SHELL_STATE,
} from "#contract/shell.ts";
import type { ShellState } from "#contract/shell.ts";
import type { Log } from "#core/log.ts";
import type { Ipc } from "#platform/ipc.ts";

import { RefusedCallError, serveContract } from "./contract-ipc.ts";
import type { ContractHandlers, ContractStateSource } from "./contract-ipc.ts";
import type { SenderRegistry } from "./senders.ts";

export type ShellHandlers = ContractHandlers<typeof SHELL_CALLS>;

/** The calls the trial-ended screen makes, the only ones answered before the app starts. */
export type LaunchHandlers = Pick<
  ShellHandlers,
  (typeof SHELL_ENTITLEMENT_CALL_NAMES)[number]
>;

/** The slices the shell draws while the launch waits for the person's choice. */
export type LaunchShellState = Pick<ShellState, "language" | "pro">;

export interface ShellIpcDeps {
  ipc: Ipc;
  senders: Pick<SenderRegistry, "identify">;
  handlers: ShellHandlers;
  state: ContractStateSource<Partial<ShellState>>;
  /** Where the shell's page is served from: `meru-app://shell`, or the dev server. */
  shellOrigin: string;
  log: Log;
}

/** Serves the shell contract to the shell's main frame alone. */
export const serveShellContract = ({ shellOrigin, ...deps }: ShellIpcDeps) => {
  // While the launch waits, the shell's state has only a few slices.
  serveContract<typeof SHELL_CALLS, typeof SHELL_STATE, Partial<ShellState>>({
    ...deps,
    role: "shell",
    surface: "shell",
    origin: shellOrigin,
    calls: SHELL_CALLS,
    slices: SHELL_STATE,
    channels: SHELL_CHANNELS,
  });
};

/**
 * What the shell contract answers from: the launch's calls and slices until
 * `start` hands it the app's, once, so the contract is served from the first
 * paint, the trial-ended screen's, and a call the launch has no answer for is
 * refused until then.
 */
export const createShellSource = (launch: {
  handlers: LaunchHandlers;
  state: {
    read: () => LaunchShellState;
    /** Returns what stops it, which `start` calls. */
    onChange: (listener: () => void) => () => void;
  };
}) => {
  let app:
    | { handlers: ShellHandlers; state: ContractStateSource<ShellState> }
    | undefined;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const launchHandlers: Partial<Record<string, (request: never) => unknown>> =
    launch.handlers;

  const handlers = Object.fromEntries(
    SHELL_CALL_NAMES.map((name) => [
      name,
      (request: never) => {
        const handler = app ? app.handlers[name] : launchHandlers[name];

        if (!handler) {
          throw new RefusedCallError(`${name} waits for the launch to go on`);
        }

        return (handler as (request: never) => unknown)(request);
      },
    ])
  ) as ShellHandlers;

  // Its own wrapper, so a change it tells after the handover tells nothing.
  const stopLaunch = launch.state.onChange(() => {
    if (!app) {
      notify();
    }
  });

  return {
    handlers,
    state: {
      read: (): Partial<ShellState> =>
        app ? app.state.read() : launch.state.read(),
      onChange: (listener: () => void) => {
        listeners.add(listener);
      },
    },
    /** Answers from the app's from now on. */
    start: (next: {
      handlers: ShellHandlers;
      state: ContractStateSource<ShellState>;
    }) => {
      if (app) {
        throw new Error("The shell's source has started already");
      }

      app = next;
      stopLaunch();
      next.state.onChange(notify);
      notify();
    },
  };
};

export type ShellSource = ReturnType<typeof createShellSource>;
