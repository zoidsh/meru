import path from "node:path";

import type { Log } from "#core/log.ts";
import type { NotificationSound, SoundRequest } from "#core/sounds.ts";
import type { SoundPlayer } from "#platform/sound-player.ts";

export interface SoundOutput {
  /** Every notification shown silent, so the system's sound never plays either. */
  quiet: boolean;
  /** Starts the sound and returns at once, whatever comes of it. */
  play: (request: SoundRequest) => void;
}

// What the audio addon throws (its DOMExceptions, TypeError, RangeError, a
// plain Error, napi's GenericFailure) and what reading a file can, by name or
// code alone: an addon's message can name the output device.
const ERROR_NAMES = [
  "AbortError",
  "EncodingError",
  "IndexSizeError",
  "InvalidAccessError",
  "InvalidStateError",
  "NotFoundError",
  "NotSupportedError",
  "TypeError",
  "RangeError",
  "Error",
] as const;
const ERROR_CODES = ["GenericFailure", "ENOENT", "EACCES", "EISDIR"] as const;

type SoundErrorName =
  | (typeof ERROR_NAMES)[number]
  | (typeof ERROR_CODES)[number]
  | "other";

/** A failure as a word from a fixed set: its code where known, else its name. */
export const soundErrorName = (error: unknown): SoundErrorName => {
  if (typeof error !== "object" || error === null) {
    return "other";
  }

  const code = "code" in error ? error.code : undefined;
  const name = "name" in error ? error.name : undefined;

  return (
    ERROR_CODES.find((known) => known === code) ??
    ERROR_NAMES.find((known) => known === name) ??
    "other"
  );
};

/** The one place a sound's name becomes a file. */
export const soundFile = (folder: string, sound: NotificationSound) =>
  path.join(folder, `${sound}.wav`);

/**
 * Plays each sound from `folder` through `player`, logging one that does not
 * play to its end. Under the background flag, for a desktop other sessions
 * share, it only logs and keeps every notification silent.
 */
export const createSoundOutput = ({
  player,
  folder,
  background,
  log,
}: {
  player: SoundPlayer;
  folder: string;
  background: boolean;
  log: Log;
}): SoundOutput => {
  const play = async ({ sound, volume }: SoundRequest) => {
    const result = await player.play(soundFile(folder, sound), volume);
    const { end } = result;

    if (end === "timedOut") {
      log("sound-failed", { sound, error: "timed-out" });
    } else if (end !== "played") {
      log("sound-failed", {
        sound,
        error: end.loading ? "addon-unavailable" : soundErrorName(end.error),
      });
    }

    if ("closeError" in result) {
      log("sound-failed", {
        sound,
        stage: "close",
        error: soundErrorName(result.closeError),
      });
    }
  };

  return {
    quiet: background,
    play: (request) => {
      if (background) {
        log("sound-held", { sound: request.sound, reason: "background" });

        return;
      }

      void play(request);
    },
  };
};
