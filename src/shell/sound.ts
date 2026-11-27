import { soundRequestSchema } from "#contract/shell-sound.ts";
import type { NotificationSound } from "#core/sounds.ts";

import aurora from "./sounds/aurora.wav";
import bead from "./sounds/bead.wav";
import bloom from "./sounds/bloom.wav";
import breath from "./sounds/breath.wav";
import daybreak from "./sounds/daybreak.wav";
import dew from "./sounds/dew.wav";
import drop from "./sounds/drop.wav";
import duet from "./sounds/duet.wav";
import glint from "./sounds/glint.wav";
import halo from "./sounds/halo.wav";
import hush from "./sounds/hush.wav";
import knock from "./sounds/knock.wav";
import letter from "./sounds/letter.wav";
import nod from "./sounds/nod.wav";
import pair from "./sounds/pair.wav";
import sip from "./sounds/sip.wav";
import sunrise from "./sounds/sunrise.wav";
import tide from "./sounds/tide.wav";
import welcome from "./sounds/welcome.wav";

/**
 * The one place a sound's name becomes a file; main never names a path. Each
 * is a URL the build hashes, fetched only when its sound first plays.
 */
const SOUND_FILES: Record<NotificationSound, string> = {
  welcome,
  sunrise,
  bloom,
  duet,
  aurora,
  daybreak,
  halo,
  letter,
  tide,
  knock,
  dew,
  bead,
  nod,
  sip,
  breath,
  drop,
  pair,
  glint,
  hush,
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
