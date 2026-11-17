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
import type { State } from "#core/state.ts";

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
 * Meru writes neither anywhere and holds them only for the action; Gmail's
 * own `GMAIL_AT` cookie stays in the profile's cookie jar, as it does for
 * the page. It never throws, and logs only the action, the outcome and
 * Gmail's error code, since Gmail's answers quote the key and the ids.
 */
export const createMailActions = ({
  post,
  poke,
  log,
  now = Date.now,
}: MailActionsDeps) => {
  const running = new Map<string, Set<AbortController>>();

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
      const held = running.get(profileId) ?? new Set<AbortController>();
      const timeout = setTimeout(() => {
        controller.abort("timed out");
      }, ACTION_TIMEOUT);
      let outcome: ActionOutcome;

      running.set(profileId, held);
      held.add(controller);

      try {
        outcome = await attempt(
          profileId,
          action,
          messageId,
          controller.signal
        );
      } catch {
        // The error is not read, so nothing of the URL can reach the log;
        // an abort's reason is one of the two set here.
        const { reason }: { reason: unknown } = controller.signal;

        outcome = {
          kind: "failed",
          reason: typeof reason === "string" ? reason : "request failed",
        };
      } finally {
        clearTimeout(timeout);
        held.delete(controller);

        if (held.size === 0 && running.get(profileId) === held) {
          running.delete(profileId);
        }
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
    /**
     * Aborts the actions running for each profile no longer listed, before
     * its data is cleared, so no late answer sets a cookie in its session.
     */
    follow: (current: State) => {
      const listed = new Set(current.profiles.map((profile) => profile.id));

      for (const [profileId, held] of running) {
        if (!listed.has(profileId)) {
          running.delete(profileId);

          for (const controller of held) {
            controller.abort("profile removed");
          }
        }
      }
    },
  };
};

export type MailActions = ReturnType<typeof createMailActions>;
