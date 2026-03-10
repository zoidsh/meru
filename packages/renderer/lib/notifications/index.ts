import type { NotificationSound } from "@meru/shared/types";
import breeze from "./sounds/breeze.wav?inline";
import chime from "./sounds/chime.wav?inline";
import duet from "./sounds/duet.wav?inline";
import knock from "./sounds/knock.wav?inline";
import linen from "./sounds/linen.wav?inline";

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
