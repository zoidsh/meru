import {
  actionOutcome,
  actionRequest,
  keyRequest,
  readKey,
} from "#core/mail-actions.ts";
import type {
  ActionOutcome,
  ActionRequest,
  ActionResponse,
  MailAction,
} from "#core/mail-actions.ts";

export interface MailActionsDeps {
  /** POSTs to Gmail's origin in the profile's session; rejects on a network error or an abort. */
  post: (
    profileId: string,
    request: ActionRequest,
    signal: AbortSignal
  ) => Promise<ActionResponse>;
  /** Polls the profile's feed soon, so its count follows. */
  poke: (profileId: string) => void;
  log: (message: string) => void;
  now?: () => number;
}

/** For both requests of an action together. */
export const ACTION_TIMEOUT = 15_000;

/**
 * Runs an action on a message through the profile's session, with no page:
 * a request Gmail refuses for its key and token, then the action with them.
 * Neither is kept past the action. It never throws, and logs only the
 * action, the outcome and Gmail's error code, since Gmail's answers quote
 * the key and the ids.
 */
export const createMailActions = ({
  post,
  poke,
  log,
  now = Date.now,
}: MailActionsDeps) => {
  const attempt = async (
    profileId: string,
    action: MailAction,
    messageId: string,
    signal: AbortSignal
  ): Promise<ActionOutcome> => {
    const key = readKey(await post(profileId, keyRequest(now()), signal));

    if (key.kind !== "read") {
      return key;
    }

    return actionOutcome(
      await post(
        profileId,
        actionRequest(action, messageId, key.value, now()),
        signal
      )
    );
  };

  return {
    run: async (
      profileId: string,
      action: MailAction,
      messageId: string
    ): Promise<ActionOutcome> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        controller.abort(new Error("timed out"));
      }, ACTION_TIMEOUT);
      let outcome: ActionOutcome;

      try {
        outcome = await attempt(
          profileId,
          action,
          messageId,
          controller.signal
        );
      } catch {
        // The error is not read, so nothing of the URL can reach the log.
        outcome = {
          kind: "failed",
          reason: controller.signal.aborted ? "timed out" : "request failed",
        };
      } finally {
        clearTimeout(timeout);
      }

      if (outcome.kind === "ok") {
        poke(profileId);
      } else {
        log(
          `Mail action ${action} of profile ${profileId}: ${outcome.kind}${outcome.kind === "failed" ? ` (${outcome.reason})` : ""}`
        );
      }

      return outcome;
    },
  };
};

export type MailActions = ReturnType<typeof createMailActions>;
