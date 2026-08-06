import type { NotificationSound } from "@meru/shared/types";
import breeze from "./sounds/breeze.wav";
import chime from "./sounds/chime.wav";
import duet from "./sounds/duet.wav";
import knock from "./sounds/knock.wav";
import linen from "./sounds/linen.wav";

export const NOTIFICATION_SOUNDS: Record<NotificationSound, { label: string; file: string }> = {
  breeze: { label: "Breeze", file: breeze },
  chime: { label: "Chime", file: chime },
  duet: { label: "Duet", file: duet },
  knock: { label: "Knock", file: knock },
  linen: { label: "Linen", file: linen },
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
