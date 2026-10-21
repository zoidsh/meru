import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { NotificationSound } from "@meru/shared/types";
import breeze from "./sounds/breeze.wav";
import chime from "./sounds/chime.wav";
import duet from "./sounds/duet.wav";
import knock from "./sounds/knock.wav";
import linen from "./sounds/linen.wav";

// lingui-set comment="Name of a notification sound, picked in Settings"
export const NOTIFICATION_SOUNDS: Record<
  NotificationSound,
  { label: MessageDescriptor; file: string }
> = {
  breeze: { label: msg`Breeze`, file: breeze },
  chime: { label: msg`Chime`, file: chime },
  duet: { label: msg`Duet`, file: duet },
  knock: { label: msg`Knock`, file: knock },
  linen: { label: msg`Linen`, file: linen },
};
// lingui-reset

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
