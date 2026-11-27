import { delay } from "es-toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSoundPlayer, PLAY_MARGIN } from "./sound-player.ts";
import type {
  DecodedSound,
  SoundContext,
  SoundSink,
  WebAudio,
} from "./sound-player.ts";

const DURATION = 1.5;

interface FakeTarget {
  connectedTo: unknown;
  connect: (target: unknown) => unknown;
}

/** A node with `fields` that remembers what it was connected to. */
const target = <Fields extends object>(fields: Fields) => {
  const made: Fields & FakeTarget = {
    ...fields,
    connectedTo: undefined,
    connect: (to) => {
      made.connectedTo = to;

      return to;
    },
  };

  return made;
};

/** A context as the library makes one, holding no device. */
const fakeContext = (
  sink: SoundSink,
  failStart: boolean,
  failClose: boolean
) => {
  const gains: (FakeTarget & { gain: { value: number } })[] = [];
  const sources: (FakeTarget & {
    buffer: DecodedSound | null;
    started: boolean;
    ended: (() => void)[];
  })[] = [];
  const made = {
    sink,
    closed: 0,
    gains,
    sources,
    destination: target({}),
    createGain: () => {
      const gain = target({ gain: { value: 1 } });

      gains.push(gain);

      return gain;
    },
    createBufferSource: () => {
      const source = target({
        buffer: null as DecodedSound | null,
        started: false,
        ended: [] as (() => void)[],
        addEventListener: (_type: "ended", listener: () => void) => {
          source.ended.push(listener);
        },
        start: () => {
          if (failStart) {
            throw new Error("InvalidStateError");
          }

          source.started = true;
        },
      });

      sources.push(source);

      return source;
    },
    close: () => {
      made.closed += 1;

      return failClose
        ? Promise.reject(new DOMException("closing", "InvalidStateError"))
        : Promise.resolve();
    },
    /** Ends every sound in it, as the library's render thread does. */
    end: () => {
      for (const source of sources) {
        for (const listener of source.ended) {
          listener();
        }
      }
    },
  } satisfies SoundContext & Record<string, unknown>;

  return made;
};

/** The library as the player takes it, holding no device. */
const fakeWebAudio = ({
  failOpen = false,
  failStart = false,
  failDecode = false,
  failClose = false,
} = {}) => {
  const contexts: ReturnType<typeof fakeContext>[] = [];
  let decodes = 0;
  const audio: WebAudio = {
    open: (sink) => {
      if (failOpen) {
        throw new Error("DeviceNotAvailable");
      }

      const context = fakeContext(sink, failStart, failClose);

      contexts.push(context);

      return context;
    },
    decode: () => {
      decodes += 1;

      return failDecode
        ? Promise.reject(new Error("EncodingError"))
        : Promise.resolve({ duration: DURATION });
    },
  };

  return { audio, contexts, decodes: () => decodes };
};

const reads: string[] = [];

const read = (file: string) => {
  reads.push(file);

  return Promise.resolve(new ArrayBuffer(8));
};

const playerOf = (audio: WebAudio, sink: SoundSink = "device") =>
  createSoundPlayer({ sink, load: () => Promise.resolve(audio), read });

describe(createSoundPlayer, () => {
  afterEach(() => {
    reads.length = 0;
    vi.useRealTimers();
  });

  it("plays the file at the volume through a gain to the sink, and closes its context once it has ended", async () => {
    const { audio, contexts } = fakeWebAudio();
    const played = playerOf(audio, "none").play("welcome.wav", 0.4);

    await delay(0);

    const [context] = contexts;

    expect(context).toMatchObject({
      sink: "none",
      closed: 0,
      gains: [{ gain: { value: 0.4 }, connectedTo: context?.destination }],
      sources: [
        {
          buffer: { duration: DURATION },
          started: true,
          connectedTo: context?.gains[0],
        },
      ],
    });

    context?.end();

    await expect(played).resolves.toStrictEqual({ end: "played" });
    expect(context?.closed).toBe(1);
  });

  it("decodes a file once, and plays each sound in a context of its own, two at once included", async () => {
    const { audio, contexts, decodes } = fakeWebAudio();
    const player = playerOf(audio);
    const first = player.play("welcome.wav", 1);
    const second = player.play("welcome.wav", 0.5);

    await delay(0);

    expect(reads).toStrictEqual(["welcome.wav"]);
    expect(decodes()).toBe(1);

    contexts[1]?.end();

    await expect(second).resolves.toStrictEqual({ end: "played" });
    expect(contexts.map(({ closed }) => closed)).toStrictEqual([0, 1]);

    contexts[0]?.end();

    await expect(first).resolves.toStrictEqual({ end: "played" });
  });

  it("closes the context after its sound's length and the margin when it never ends, and only once", async () => {
    vi.useFakeTimers();

    const { audio, contexts } = fakeWebAudio();
    const played = playerOf(audio).play("welcome.wav", 1);

    await vi.advanceTimersByTimeAsync(DURATION * 1000 + PLAY_MARGIN - 1);

    expect(contexts[0]?.closed).toBe(0);

    await vi.advanceTimersByTimeAsync(1);

    await expect(played).resolves.toStrictEqual({ end: "timedOut" });

    contexts[0]?.end();
    await vi.advanceTimersByTimeAsync(0);

    expect(contexts[0]?.closed).toBe(1);
  });

  it("closes the context when the sound fails to start", async () => {
    const { audio, contexts } = fakeWebAudio({ failStart: true });

    await expect(playerOf(audio).play("welcome.wav", 1)).resolves.toStrictEqual(
      { end: { error: new Error("InvalidStateError") } }
    );
    expect(contexts[0]?.closed).toBe(1);
  });

  it("answers how the sound ended and why its context did not close, closing it once", async () => {
    const { audio, contexts } = fakeWebAudio({ failClose: true });
    const played = playerOf(audio).play("welcome.wav", 1);

    await delay(0);
    contexts[0]?.end();

    await expect(played).resolves.toStrictEqual({
      end: "played",
      closeError: new DOMException("closing", "InvalidStateError"),
    });
    expect(contexts[0]?.closed).toBe(1);
  });

  it("answers the error when no context can be made, as with no output device", async () => {
    const { audio } = fakeWebAudio({ failOpen: true });

    await expect(playerOf(audio).play("welcome.wav", 1)).resolves.toStrictEqual(
      { end: { error: new Error("DeviceNotAvailable") } }
    );
  });

  it("makes no context for a file that does not decode, and reads it again next time", async () => {
    const { audio, contexts } = fakeWebAudio({ failDecode: true });
    const player = playerOf(audio);

    await expect(player.play("welcome.wav", 1)).resolves.toStrictEqual({
      end: { error: new Error("EncodingError") },
    });
    await expect(player.play("welcome.wav", 1)).resolves.toStrictEqual({
      end: { error: new Error("EncodingError") },
    });
    expect(contexts).toHaveLength(0);
    expect(reads).toStrictEqual(["welcome.wav", "welcome.wav"]);
  });

  it("loads the addon only once a sound is asked for, and answers the error when it does not load", async () => {
    let loads = 0;
    const player = createSoundPlayer({
      sink: "device",
      load: () => {
        loads += 1;

        return Promise.reject(new Error("dlopen failed"));
      },
      read,
    });

    expect(loads).toBe(0);
    await expect(player.play("welcome.wav", 1)).resolves.toStrictEqual({
      end: { error: new Error("dlopen failed"), loading: true },
    });
    await expect(player.play("nod.wav", 1)).resolves.toStrictEqual({
      end: { error: new Error("dlopen failed"), loading: true },
    });
    expect([loads, reads]).toStrictEqual([1, []]);
  });
});
