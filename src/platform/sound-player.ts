// The one file that loads node-web-audio-api, which lint refuses anywhere
// else, so playback can go back to a renderer by replacing this adapter.

import { readFile } from "node:fs/promises";

/**
 * How a sound ended: to its end, cut off by its time limit, or not at all,
 * `loading` when the addon itself did not load, as on Linux without
 * PipeWire's client library, which its binary links.
 */
export type SoundEnd =
  | "played"
  | "timedOut"
  | { error: unknown; loading?: true };

export interface SoundResult {
  end: SoundEnd;
  /**
   * Why its context did not close, when it did not; the library then keeps
   * that context, and any stream it holds, until Meru quits.
   */
  closeError?: unknown;
}

export interface SoundPlayer {
  /**
   * Plays a WAV file once at `volume`, beside any other sound playing, and
   * settles once it has ended and its context is closed. Never rejects.
   */
  play: (file: string, volume: number) => Promise<SoundResult>;
}

/**
 * `device` is the system's default output. `none` renders the sound to its
 * end on a thread of the library's with no output device opened at all, so
 * nothing can be heard.
 */
export type SoundSink = "device" | "none";

/** A decoded sound, playable in any context. */
export interface DecodedSound {
  /** In seconds. */
  readonly duration: number;
}

interface AudioTarget {
  connect: (target: AudioTarget) => unknown;
}

interface SoundSource extends AudioTarget {
  buffer: DecodedSound | null;
  addEventListener: (
    type: "ended",
    listener: () => void,
    options: { once: true }
  ) => void;
  start: () => void;
}

/** The context one sound plays in, holding an output stream until closed. */
export interface SoundContext {
  readonly destination: AudioTarget;
  createGain: () => AudioTarget & { gain: { value: number } };
  createBufferSource: () => SoundSource;
  close: () => Promise<void>;
}

/** What the player takes of the library. */
export interface WebAudio {
  /** Throws when no context can be made, as with no output device. */
  open: (sink: SoundSink) => SoundContext;
  /** Opens no device. */
  decode: (data: ArrayBuffer) => Promise<DecodedSound>;
}

/**
 * How long a sound may outlast its own length before its context is closed
 * regardless: a device that stalls (the library's issue 205) holds a stream,
 * and with it the next change to that context, for no longer than this.
 */
export const PLAY_MARGIN = 2000;

// The files are rendered at 48 kHz, so decoding at that rate leaves them as
// they are; a context at another rate resamples as it plays.
const DECODE_RATE = 48_000;

interface Library {
  AudioContext: new (options: {
    latencyHint: "playback";
    sinkId?: { type: "none" };
  }) => SoundContext;
  OfflineAudioContext: new (
    numberOfChannels: number,
    length: number,
    sampleRate: number
  ) => { decodeAudioData: (data: ArrayBuffer) => Promise<DecodedSound> };
}

const loadWebAudio = async (): Promise<WebAudio> => {
  // A string, so TypeScript leaves out the package's own types, which bring
  // the whole DOM into main's program; the bundler still sees the name.
  const { AudioContext, OfflineAudioContext } = (await import(
    "node-web-audio-api" as string
  )) as Library;

  return {
    open: (sink) =>
      new AudioContext({
        latencyHint: "playback",
        ...(sink === "none" ? { sinkId: { type: "none" } } : {}),
      }),
    decode: (data) =>
      new OfflineAudioContext(2, 1, DECODE_RATE).decodeAudioData(data),
  };
};

const readArrayBuffer = async (file: string) => {
  const bytes = await readFile(file);

  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
};

const closed = async (
  context: SoundContext,
  end: SoundEnd
): Promise<SoundResult> => {
  try {
    await context.close();

    return { end };
  } catch (closeError) {
    return { end, closeError };
  }
};

/**
 * Plays each sound in a context of its own, so no stream stays open while
 * nothing plays, closed once the sound ends, fails or outlasts its length by
 * `PLAY_MARGIN`. A file is decoded once and kept decoded. The library loads
 * at the first sound, so a run that plays none never loads it.
 */
export const createSoundPlayer = ({
  sink,
  load = loadWebAudio,
  read = readArrayBuffer,
}: {
  sink: SoundSink;
  load?: () => Promise<WebAudio>;
  read?: (file: string) => Promise<ArrayBuffer>;
}): SoundPlayer => {
  let library: Promise<WebAudio> | undefined;
  const decoded = new Map<string, Promise<DecodedSound>>();
  // The library reports a source's end only while something else holds the
  // source, as it keeps it through a WeakRef; this holds each until it ends.
  const playing = new Set<SoundSource>();

  const decode = (audio: WebAudio, file: string) => {
    const known = decoded.get(file);

    if (known) {
      return known;
    }

    const decoding = read(file).then(audio.decode);

    decoded.set(file, decoding);
    // One that failed is read again next time, as a file can come back.
    decoding.catch(() => decoded.delete(file));

    return decoding;
  };

  const run = (context: SoundContext, sound: DecodedSound, volume: number) => {
    const { promise, resolve } = Promise.withResolvers<SoundResult>();
    let source: SoundSource | undefined;
    let settled = false;

    const finish = (end: SoundEnd) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(limit);

      if (source) {
        playing.delete(source);
      }

      resolve(closed(context, end));
    };

    const limit = setTimeout(
      () => finish("timedOut"),
      sound.duration * 1000 + PLAY_MARGIN
    );

    try {
      const gain = context.createGain();

      source = context.createBufferSource();
      playing.add(source);
      gain.gain.value = volume;
      source.buffer = sound;
      source.addEventListener("ended", () => finish("played"), { once: true });
      source.connect(gain);
      gain.connect(context.destination);
      source.start();
    } catch (error) {
      finish({ error });
    }

    return promise;
  };

  return {
    play: async (file, volume) => {
      let audio: WebAudio;
      let sound: DecodedSound;
      let context: SoundContext;

      try {
        library ??= load();
        audio = await library;
      } catch (error) {
        return { end: { error, loading: true } };
      }

      try {
        sound = await decode(audio, file);
        context = audio.open(sink);
      } catch (error) {
        return { end: { error } };
      }

      return run(context, sound, volume);
    },
  };
};
