import { delay } from "es-toolkit";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ActionRequest, ActionResponse } from "#core/mail-actions.ts";
import { newProfile } from "#core/state.ts";

import { ACTION_TIMEOUT, createMailActions } from "./mail-actions.ts";

const IK = "0a1b2c3d4e";
const AT = "AF6bupNfake_tokenValue0123456789ab";
const MESSAGE = "1a1e09987b6d8188";

const framed = (chunk: unknown) => {
  const json = JSON.stringify(chunk);

  return `)]}'\n${json.length}&${json}`;
};

const response = (
  error: unknown,
  setCookies: string[] = []
): ActionResponse => ({
  kind: "response",
  status: 200,
  body: framed([null, [[null, error]], 2, 0, IK]),
  setCookies,
});

/** Gmail's refusal of the key request, quoting the key, with a token cookie. */
const KEY_ANSWER = response(
  [
    null,
    `Invalid request ID key: '' does not match current user key '${IK}'`,
    12,
  ],
  [`GMAIL_AT=${AT}; Path=/mail/u/0/s/; Secure`]
);

const setup = (
  answers: (
    request: ActionRequest,
    signal: AbortSignal
  ) => Promise<ActionResponse>
) => {
  const sent: [string, URLSearchParams][] = [];
  const poked: string[] = [];
  const caughtUp: string[] = [];
  const logged: string[] = [];
  const actions = createMailActions({
    post: (profileId, request, signal) => {
      sent.push([profileId, new URL(request.path, "https://x").searchParams]);

      return answers(request, signal);
    },
    poke: (profileId) => {
      poked.push(profileId);
    },
    catchUp: (profileId) => {
      caughtUp.push(profileId);
    },
    log: (message) => {
      logged.push(message);
    },
    now: () => 1,
  });

  return { actions, sent, poked, caughtUp, logged };
};

/** Answers the key request with a key, and the action with `action`. */
const keyThen =
  (action: ActionResponse | Error) => (request: ActionRequest) => {
    if (new URL(request.path, "https://x").searchParams.get("ik") === "") {
      return Promise.resolve(KEY_ANSWER);
    }

    return action instanceof Error
      ? Promise.reject(action)
      : Promise.resolve(action);
  };

/** Never answers, and rejects with the signal's reason once it aborts. */
const hang = (signal: AbortSignal) => {
  const { promise, reject } = Promise.withResolvers<ActionResponse>();

  signal.addEventListener("abort", () => {
    reject(signal.reason);
  });

  return promise;
};

/** Answers the key request with a key, and never answers the action. */
const keyThenHang = (request: ActionRequest, signal: AbortSignal) =>
  new URL(request.path, "https://x").searchParams.get("ik") === ""
    ? Promise.resolve(KEY_ANSWER)
    : hang(signal);

describe(createMailActions, () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the action with the key and token the first answer gave, then pokes the feed and has the page catch up", async () => {
    const { actions, sent, poked, caughtUp, logged } = setup(
      keyThen(response(null))
    );

    await expect(
      actions.run("p1", "markAsRead", MESSAGE)
    ).resolves.toStrictEqual({ kind: "ok" });
    expect(
      sent.map(([profileId, query]) => [
        profileId,
        query.get("ik"),
        query.get("at"),
      ])
    ).toStrictEqual([
      ["p1", "", ""],
      ["p1", IK, AT],
    ]);
    expect(poked).toStrictEqual(["p1"]);
    expect(caughtUp).toStrictEqual(["p1"]);
    expect(logged).toStrictEqual([]);
  });

  it("fails on Gmail's error, logging its code and nothing of its text, and neither pokes nor has the page catch up", async () => {
    const { actions, poked, caughtUp, logged } = setup(
      keyThen(response([null, `Invalid action token for ${MESSAGE} ${IK}`, 10]))
    );

    await expect(actions.run("p1", "archive", MESSAGE)).resolves.toStrictEqual({
      kind: "failed",
      reason: "Gmail error 10",
    });
    expect(poked).toStrictEqual([]);
    expect(caughtUp).toStrictEqual([]);
    expect(logged).toStrictEqual([
      "Mail action archive of profile p1: failed (Gmail error 10)",
    ]);
  });

  it("stops at the key request when it finds the profile signed out", async () => {
    const { actions, sent, logged } = setup(() =>
      Promise.resolve({ kind: "redirect" })
    );

    await expect(actions.run("p1", "delete", MESSAGE)).resolves.toStrictEqual({
      kind: "signedOut",
    });
    expect(sent).toHaveLength(1);
    expect(logged).toStrictEqual([
      "Mail action delete of profile p1: signedOut",
    ]);
  });

  it("fails without the error's text when a request rejects", async () => {
    const { actions, logged } = setup(
      keyThen(new Error(`net::ERR_FAILED at=${AT}`))
    );

    await expect(
      actions.run("p1", "markAsSpam", MESSAGE)
    ).resolves.toStrictEqual({ kind: "failed", reason: "request failed" });
    expect(logged.join("\n")).not.toContain(AT);
  });

  it("gives up on both requests together after 15 s", async () => {
    vi.useFakeTimers();

    const { actions, sent, logged } = setup(async (request, signal) => {
      // The key request takes most of the limit, the action the rest.
      if (new URL(request.path, "https://x").searchParams.get("ik") === "") {
        await delay(ACTION_TIMEOUT - 1000);

        return KEY_ANSWER;
      }

      return hang(signal);
    });
    const outcome = actions.run("p1", "archive", MESSAGE);

    await vi.advanceTimersByTimeAsync(ACTION_TIMEOUT - 1000);

    expect(sent).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(999);

    expect(logged).toStrictEqual([]);

    await vi.advanceTimersByTimeAsync(1);

    await expect(outcome).resolves.toStrictEqual({
      kind: "failed",
      reason: "timed out",
    });
    expect(logged).toStrictEqual([
      "Mail action archive of profile p1: failed (timed out)",
    ]);
  });

  it("aborts a removed profile's running action, before its data is cleared, and leaves the others", async () => {
    const { actions, sent, logged } = setup(keyThenHang);
    const removed = actions.run("p1", "archive", MESSAGE);
    const kept = actions.run("p2", "archive", MESSAGE);

    await vi.waitFor(() => {
      expect(sent).toHaveLength(4);
    });
    actions.follow({
      version: 1,
      profiles: [newProfile("p2", "Work")],
      selectedProfileId: "p2",
    });

    await expect(removed).resolves.toStrictEqual({
      kind: "failed",
      reason: "profile removed",
    });
    expect(logged).toStrictEqual([
      "Mail action archive of profile p1: failed (profile removed)",
    ]);
    await expect(
      Promise.race([kept, delay(20).then(() => "running")])
    ).resolves.toBe("running");

    actions.follow({ version: 1, profiles: [], selectedProfileId: "" });

    await expect(kept).resolves.toStrictEqual({
      kind: "failed",
      reason: "profile removed",
    });
  });
});
