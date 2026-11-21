import { SHELL_CALLS, SHELL_CHANNELS, SHELL_STATE } from "#contract/shell.ts";
import type { ShellState } from "#contract/shell.ts";
import type { Ipc } from "#platform/ipc.ts";

import { serveContract } from "./contract-ipc.ts";
import type { ContractHandlers, ContractStateSource } from "./contract-ipc.ts";
import type { SenderRegistry } from "./senders.ts";

export type ShellHandlers = ContractHandlers<typeof SHELL_CALLS>;

export interface ShellIpcDeps {
  ipc: Ipc;
  senders: Pick<SenderRegistry, "identify">;
  handlers: ShellHandlers;
  state: ContractStateSource<ShellState>;
  /** Where the shell's page is served from: `meru-app://shell`, or the dev server. */
  shellOrigin: string;
  log: (message: string) => void;
}

/** Serves the shell contract to the shell's main frame alone. */
export const serveShellContract = ({ shellOrigin, ...deps }: ShellIpcDeps) => {
  serveContract({
    ...deps,
    role: "shell",
    surface: "shell",
    origin: shellOrigin,
    calls: SHELL_CALLS,
    slices: SHELL_STATE,
    channels: SHELL_CHANNELS,
  });
};
