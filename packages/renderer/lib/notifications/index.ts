import type { NotificationSound } from "@meru/shared/types";
import bell from "./sounds/bell.wav?inline";
import bubble from "./sounds/bubble.wav?inline";
import longPop from "./sounds/long-pop.wav?inline";
import magicMarimba from "./sounds/magic-marimba.wav?inline";
import magicRing from "./sounds/magic-ring.wav?inline";
import retroGame from "./sounds/retro-game.wav?inline";

export const NOTIFICATION_SOUNDS: Record<NotificationSound, { label: string; file: string }> = {
  bell: {
    label: "Bell",
    file: bell,
  },
  bubble: {
    label: "Bubble",
    file: bubble,
  },
  "long-pop": { label: "Long Pop", file: longPop },
  "magic-marimba": {
    label: "Magic Marimba",
    file: magicMarimba,
  },
  "magic-ring": {
    label: "Magic Ring",
    file: magicRing,
  },
  "retro-game": {
    label: "Retro Game",
    file: retroGame,
  },
};

export function playNotificationSound({
  sound,
  volume,
}: {
  sound: NotificationSound;
  volume: number;
}) {
  const audio = new Audio(NOTIFICATION_SOUNDS[sound].file);

  audio.volume = volume;

  audio.play();
}
