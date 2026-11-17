// Apart from shell.ts, so the shell renderer checks a sound with this schema
// alone and bundles none of the calls' and slices'.

import { z } from "zod/mini";

import { NOTIFICATION_SOUNDS, soundVolumeSchema } from "#core/sounds.ts";

/** Main to the shell, on `SHELL_CHANNELS.sound`: play this sound now. */
export const soundRequestSchema = z.object({
  sound: z.enum(NOTIFICATION_SOUNDS),
  volume: soundVolumeSchema,
});

export type SoundRequest = z.output<typeof soundRequestSchema>;
