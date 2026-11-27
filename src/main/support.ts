import { t } from "@lingui/core/macro";

import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { State } from "#core/state.ts";
import { supportMailto } from "#core/support.ts";

/**
 * Writes to Meru's support about the license, as v3's Help menu writes: a
 * compose window in the selected profile's Gmail, asking no profile. While
 * that profile is known to be signed out its Gmail can compose nothing, so
 * the link goes to the system's mail app instead. It is no link handed to
 * Meru, so it needs no Meru Pro.
 */
export const createContactSupport =
  ({
    state,
    signedOut,
    compose,
    openExternal,
    log,
  }: {
    state: () => State;
    signedOut: (profileId: string) => boolean;
    compose: (profileId: string, mailto: string) => void;
    /** Meru's own links' way out, which asks nothing. */
    openExternal: (url: string) => Promise<void>;
    log: Log;
  }) =>
  async () => {
    const mailto = supportMailto(
      t({
        message: "Meru Pro license",
        comment:
          "Subject of the email to Meru's support that Contact support on the Meru Pro page of Settings starts, when the license can't be used",
      })
    );
    const { selectedProfileId } = state();

    if (signedOut(selectedProfileId)) {
      try {
        await openExternal(mailto);
      } catch (error) {
        log("support-email-failed", { error: scrub.error(error) });
      }

      return;
    }

    compose(selectedProfileId, mailto);
  };
