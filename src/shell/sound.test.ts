import { describe, expect, it } from "vitest";

import { NOTIFICATION_SOUNDS } from "#core/sounds.ts";

import { playSounds } from "./sound.ts";

const setup = ({ fails = false } = {}) => {
  let deliver: ((request: unknown) => void) | undefined;
  let stopped = false;
  const played: { src: string; volume: number }[] = [];
  const logs: string[] = [];
  const stop = playSounds(
    {
      onSound: (listener) => {
        deliver = listener;

        return () => {
          stopped = true;
        };
      },
    },
    (src) => {
      const audio = {
        volume: 1,
        play: () => {
          played.push({ src, volume: audio.volume });

          return fails
            ? Promise.reject(new Error("NotAllowedError"))
            : Promise.resolve();
        },
      };

      return audio;
    },
    (message) => {
      logs.push(message);
    }
  );

  return {
    send: (request: unknown) => deliver?.(request),
    played,
    logs,
    stop: () => {
      stop();

      return stopped;
    },
  };
};

describe(playSounds, () => {
  it("plays the named sound's bundled file at the volume asked", () => {
    const { send, played } = setup();

    send({ sound: "bloom", volume: 0.4 });

    expect(played).toStrictEqual([
      { src: expect.stringMatching(/bloom\.wav$/u), volume: 0.4 },
    ]);
  });

  it("gives each of the nineteen sounds a file of its own, named for it", () => {
    const { send, played } = setup();

    for (const sound of NOTIFICATION_SOUNDS) {
      send({ sound, volume: 1 });
    }

    expect([
      new Set(played.map(({ src }) => src)).size,
      played.every(({ src }, index) =>
        src.endsWith(`${NOTIFICATION_SOUNDS[index]}.wav`)
      ),
    ]).toStrictEqual([19, true]);
  });

  it("ignores a request that names no bundled sound, a path, or a volume out of range", () => {
    const { send, played, logs } = setup();

    for (const request of [
      { sound: "../../secret", volume: 1 },
      { sound: "system", volume: 1 },
      { sound: "toString", volume: 1 },
      { sound: "linen", volume: 1 },
      { sound: "welcome", volume: 0 },
      { sound: "welcome", volume: 2 },
      { sound: "welcome" },
      "welcome",
      undefined,
    ]) {
      send(request);
    }

    expect(played).toStrictEqual([]);
    expect(logs).toHaveLength(9);
  });

  it("logs a sound that did not play", async () => {
    const { send, logs } = setup({ fails: true });

    send({ sound: "duet", volume: 1 });
    await Promise.resolve();

    expect(logs).toStrictEqual([
      "The duet sound did not play: NotAllowedError",
    ]);
  });

  it("stops listening when told", () => {
    expect(setup().stop()).toBeTruthy();
  });
});
