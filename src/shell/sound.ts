import { soundRequestSchema } from "#contract/shell-sound.ts";
import type { NotificationSound } from "#core/sounds.ts";

import breeze from "./sounds/breeze.wav";
import chime from "./sounds/chime.wav";
import duet from "./sounds/duet.wav";
import knock from "./sounds/knock.wav";
import linen from "./sounds/linen.wav";

/** The one place a sound's name becomes a file; main never names a path. */
const SOUND_FILES: Record<NotificationSound, string> = {
  breeze,
  chime,
  duet,
  knock,
  linen,
};

interface Playable {
  volume: number;
  play: () => Promise<void>;
}

/**
 * Plays each sound main asks for that `soundRequestSchema` accepts, and
 * ignores the rest. Returns what stops listening.
 */
export const playSounds = (
  bridge: { onSound: (listener: (request: unknown) => void) => () => void },
  createAudio: (src: string) => Playable = (src) => new Audio(src),
  log: (message: string) => void = console.error
) => {
  const play = async (payload: unknown) => {
    const request = soundRequestSchema.safeParse(payload);

    if (!request.success) {
      log("Ignored a malformed sound request");

      return;
    }

    const audio = createAudio(SOUND_FILES[request.data.sound]);

    audio.volume = request.data.volume;

    try {
      await audio.play();
    } catch (error) {
      log(
        `The ${request.data.sound} sound did not play: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  };

  return bridge.onSound((payload) => {
    void play(payload);
  });
};
