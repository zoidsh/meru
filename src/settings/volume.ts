import { isNotificationSound } from "#core/sounds.ts";
import type {
  NewEmailSoundChoice,
  NotificationSound,
  OtherSoundChoice,
} from "#core/sounds.ts";

import type { ListedProfile } from "./scope.ts";

/**
 * The sound the volume is heard in: the app's new email sound when it is one
 * of Meru's, else the first profile's own of Meru's in the titlebar's order,
 * else the app's sound for other notifications. None while no sound the
 * volume applies to is chosen anywhere.
 */
export const volumeSound = (
  appSound: NewEmailSoundChoice,
  otherSound: OtherSoundChoice,
  profiles: readonly ListedProfile[]
): NotificationSound | undefined =>
  [
    appSound,
    ...profiles.map((profile) => profile.overrides.notificationSound),
    otherSound,
  ].find(isNotificationSound);
