import { SHELL_CHANNELS } from "#contract/shell-channels.ts";
import type { SoundRequest } from "#contract/shell-sound.ts";
import type { Log } from "#core/log.ts";
import type { Ipc } from "#platform/ipc.ts";

export interface SoundOutput {
  /** Every notification shown silent, so the system's sound never plays either. */
  quiet: boolean;
  play: (request: SoundRequest) => void;
}

/**
 * Plays a sound in the shell's page while its main frame is on the shell's
 * origin, and nothing when it is gone or elsewhere. Under the background flag,
 * for a desktop other sessions share, it only logs and keeps every
 * notification silent.
 */
export const createSoundOutput = ({
  ipc,
  shellId,
  shellOrigin,
  background,
  log,
}: {
  ipc: Pick<Ipc, "send">;
  shellId: number;
  shellOrigin: string;
  background: boolean;
  log: Log;
}): SoundOutput => ({
  quiet: background,
  play: (request) => {
    if (background) {
      log("sound-held", { sound: request.sound, reason: "background" });

      return;
    }

    ipc.send(shellId, SHELL_CHANNELS.sound, request, {
      mainFrameOrigin: shellOrigin,
    });
  },
});
