import path from "node:path";

import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { NotificationSound, SoundRequest } from "#core/sounds.ts";
import type { SoundPlayer } from "#platform/sound-player.ts";

export interface SoundOutput {
  /** Every notification shown silent, so the system's sound never plays either. */
  quiet: boolean;
  /** Starts the sound and returns at once, whatever comes of it. */
  play: (request: SoundRequest) => void;
}

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

    if (result === "timedOut") {
      log("sound-failed", { sound, reason: "timed-out" });
    } else if (result !== "played") {
      log("sound-failed", { sound, code: scrub.code(result.error) });
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
