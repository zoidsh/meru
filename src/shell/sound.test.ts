import { describe, expect, it } from "vitest";

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

    send({ sound: "chime", volume: 0.4 });

    expect(played).toStrictEqual([
      { src: expect.stringMatching(/chime\.wav$/u), volume: 0.4 },
    ]);
  });

  it("gives every sound a file of its own", () => {
    const { send, played } = setup();

    for (const sound of ["breeze", "chime", "duet", "knock", "linen"]) {
      send({ sound, volume: 1 });
    }

    expect(new Set(played.map(({ src }) => src)).size).toBe(5);
  });

  it("ignores a request that names no bundled sound, a path, or a volume out of range", () => {
    const { send, played, logs } = setup();

    for (const request of [
      { sound: "../../secret", volume: 1 },
      { sound: "system", volume: 1 },
      { sound: "toString", volume: 1 },
      { sound: "linen", volume: 0 },
      { sound: "linen", volume: 2 },
      { sound: "linen" },
      "linen",
      undefined,
    ]) {
      send(request);
    }

    expect(played).toStrictEqual([]);
    expect(logs).toHaveLength(8);
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
