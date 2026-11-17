import { describe, expect, it } from "vitest";

import { SHELL_CHANNELS } from "#contract/shell-channels.ts";

import { createSoundOutput } from "./sounds.ts";

const SHELL_ORIGIN = "meru-app://shell";

const setup = ({ background = false, delivered = true } = {}) => {
  const sent: unknown[][] = [];
  const logs: string[] = [];
  const output = createSoundOutput({
    ipc: {
      send: (...args) => {
        sent.push(args);

        return delivered;
      },
    },
    shellId: 7,
    shellOrigin: SHELL_ORIGIN,
    background,
    log: (message) => {
      logs.push(message);
    },
  });

  return { output, sent, logs };
};

describe(createSoundOutput, () => {
  it("sends the sound to the shell's main frame on the shell's origin alone", () => {
    const { output, sent, logs } = setup();

    output.play({ sound: "linen", volume: 0.5 });

    expect([output.quiet, sent, logs]).toStrictEqual([
      false,
      [
        [
          7,
          SHELL_CHANNELS.sound,
          { sound: "linen", volume: 0.5 },
          { mainFrameOrigin: SHELL_ORIGIN },
        ],
      ],
      [],
    ]);
  });

  it("under the background flag sends nothing, logs the sound, and keeps notifications silent", () => {
    const { output, sent, logs } = setup({ background: true });

    output.play({ sound: "duet", volume: 1 });

    expect([output.quiet, sent, logs]).toStrictEqual([
      true,
      [],
      ["Did not play the duet sound under the background flag"],
    ]);
  });

  it("does not throw when the shell is gone or on another origin", () => {
    const { output, sent } = setup({ delivered: false });

    expect(() => {
      output.play({ sound: "knock", volume: 1 });
    }).not.toThrow();
    expect(sent).toHaveLength(1);
  });
});
