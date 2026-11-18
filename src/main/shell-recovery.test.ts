import { describe, expect, it } from "vitest";

import {
  SHELL_RELOAD_LIMIT,
  SHELL_RELOAD_WINDOW_MS,
  createShellRecovery,
} from "./shell-recovery.ts";

const recover = () => {
  const calls: string[] = [];
  const dialogs: string[] = [];
  let gone: ((reason: string) => void) | undefined;
  let time = 0;

  createShellRecovery({
    window: {
      onRendererGone: (listener) => {
        gone = listener;
      },
      reload: () => {
        calls.push("reload");
      },
    },
    productName: "Meru",
    now: () => time,
    showErrorDialog: (title) => {
      dialogs.push(title);
    },
    quit: () => {
      calls.push("quit");
    },
    log: () => false,
  });

  return {
    calls,
    dialogs,
    die: (reason = "crashed") => {
      gone?.(reason);
    },
    wait: (ms: number) => {
      time += ms;
    },
  };
};

describe(createShellRecovery, () => {
  it("reloads the shell's page when its process dies", () => {
    const shell = recover();

    shell.die("crashed");
    shell.die("oom");

    expect(shell.calls).toStrictEqual(["reload", "reload"]);
    expect(shell.dialogs).toStrictEqual([]);
  });

  it("leaves a clean exit alone", () => {
    const shell = recover();

    shell.die("clean-exit");

    expect(shell.calls).toStrictEqual([]);
  });

  it("stops after the limit within a minute, says so and quits", () => {
    const shell = recover();

    for (let death = 0; death <= SHELL_RELOAD_LIMIT; death += 1) {
      shell.die();
      shell.wait(1000);
    }

    expect(shell.calls).toStrictEqual([
      ...Array.from({ length: SHELL_RELOAD_LIMIT }, () => "reload"),
      "quit",
    ]);
    expect(shell.dialogs).toStrictEqual(["Meru could not draw its window"]);
  });

  it("counts only the reloads of the last minute", () => {
    const shell = recover();

    for (let death = 0; death < SHELL_RELOAD_LIMIT * 2; death += 1) {
      shell.die();
      shell.wait(SHELL_RELOAD_WINDOW_MS / SHELL_RELOAD_LIMIT);
    }

    expect(shell.calls).toStrictEqual(
      Array.from({ length: SHELL_RELOAD_LIMIT * 2 }, () => "reload")
    );
  });
});
