import { describe, expect, it } from "vitest";

import {
  actionOutcome,
  actionRequest,
  keyRequest,
  readKey,
} from "./mail-actions.ts";
import type { ActionResponse, MailAction } from "./mail-actions.ts";

const KEY = { ik: "0a1b2c3d4e", at: "AF6bupNfake_tokenValue0123456789ab" };

/** Gmail's framing around each chunk. */
const framed = (...chunks: unknown[]) =>
  `)]}'\n${chunks
    .map((chunk) => {
      const json = JSON.stringify(chunk);

      return `${json.length}&${json}`;
    })
    .join("")}`;

const answer = (
  body: string,
  { status = 200, setCookies = [] as string[] } = {}
): ActionResponse => ({ kind: "response", status, body, setCookies });

/** A chunk as Gmail answers one request, its error in place or `null`. */
const chunk = (error: unknown, ik = KEY.ik) => [
  null,
  [[null, error, null, null, [], null, null, null, null, null, null]],
  2,
  0,
  ik,
];

const sjr = (body: string) =>
  JSON.parse(new URLSearchParams(body).get("s_jr") ?? "null") as unknown;

describe(actionRequest, () => {
  it.each<[MailAction, number]>([
    ["archive", 1],
    ["markAsRead", 3],
    ["delete", 9],
    ["markAsSpam", 7],
  ])("sends %s as Gmail's code %i on the message", (action, code) => {
    const { path, body } = actionRequest(action, "1a1e09987b6d8188", KEY, 42);
    const url = new URL(path, "https://mail.google.com");

    expect(url.pathname).toBe("/mail/u/0/s/");
    expect(Object.fromEntries(url.searchParams)).toStrictEqual({
      v: "or",
      ik: KEY.ik,
      at: KEY.at,
      subui: "chrome",
      hl: "en",
      ts: "42",
    });
    expect(sjr(body)).toStrictEqual([
      null,
      [
        [
          null,
          null,
          null,
          [
            null,
            code,
            "1a1e09987b6d8188",
            "1a1e09987b6d8188",
            "l:all",
            [],
            [],
            [],
          ],
        ],
      ],
      2,
      null,
      null,
      null,
      KEY.ik,
    ]);
  });
});

describe(keyRequest, () => {
  it("asks for the counts alone, with no key and no token", () => {
    const { path, body } = keyRequest(7);
    const url = new URL(path, "https://mail.google.com");

    expect(url.searchParams.get("ik")).toBe("");
    expect(url.searchParams.get("at")).toBe("");
    expect(sjr(body)).toStrictEqual([
      null,
      [[null, null, null, null, null, null, [null, true, false]]],
      2,
      null,
      null,
      null,
      "",
    ]);
  });
});

describe(readKey, () => {
  const refused = framed(
    chunk([null, "Invalid request ID key: '' does not match", 12])
  );

  it("takes the key from the answer and the token from the cookie it sets", () => {
    expect(
      readKey(
        answer(refused, {
          setCookies: [
            "SIDCC=x; Path=/",
            `GMAIL_AT=${KEY.at}; Path=/mail/u/0/s/; Secure`,
          ],
        })
      )
    ).toStrictEqual({ kind: "read", value: KEY });
  });

  it("fails with no token cookie", () => {
    expect(readKey(answer(refused))).toStrictEqual({
      kind: "failed",
      reason: "no token",
    });
  });

  it("fails when the answer carries no key", () => {
    expect(
      readKey(
        answer(framed(chunk(null, "")), {
          setCookies: [`GMAIL_AT=${KEY.at}`],
        })
      )
    ).toStrictEqual({ kind: "failed", reason: "no key" });
  });

  it("reads sign-in's script as signed out", () => {
    expect(
      readKey(
        answer(
          '<script>top.location="https://accounts.google.com/ServiceLogin"</script>'
        )
      )
    ).toStrictEqual({ kind: "signedOut" });
  });
});

describe(actionOutcome, () => {
  it("is ok when the first request has no error", () => {
    expect(actionOutcome(answer(framed(chunk(null))))).toStrictEqual({
      kind: "ok",
    });
  });

  it.each([
    [[null, "Invalid action token", 10], "Gmail error 10"],
    [[null, "Invalid request ID key", 12], "Gmail error 12"],
    [[null, "Could not parse message ID: 1a1e", 9], "Gmail error 9"],
    [[null, "no code"], "Gmail error unknown"],
  ])("fails on %j with its code alone", (gmailError, reason) => {
    expect(actionOutcome(answer(framed(chunk(gmailError))))).toStrictEqual({
      kind: "failed",
      reason,
    });
  });

  it.each<[string, ActionResponse]>([
    ["a redirect", { kind: "redirect" }],
    ["a 401", answer("", { status: 401 })],
    ["a 403", answer("", { status: 403 })],
    ["an answer that is not framed", answer("<html></html>")],
  ])("is signed out on %s", (_name, response) => {
    expect(actionOutcome(response)).toStrictEqual({ kind: "signedOut" });
  });

  it("fails on another status", () => {
    expect(actionOutcome(answer("", { status: 500 }))).toStrictEqual({
      kind: "failed",
      reason: "HTTP 500",
    });
  });

  it("is ok on the shape of Gmail's live success, alone or with the chunks a longer request adds", () => {
    const success = [
      null,
      [
        [
          null,
          null,
          null,
          null,
          [],
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          null,
          0,
          0,
        ],
      ],
      2,
      0,
      KEY.ik,
    ];

    expect(actionOutcome(answer(framed(success)))).toStrictEqual({
      kind: "ok",
    });
    expect(
      actionOutcome(answer(framed(success, chunk(null), chunk(null))))
    ).toStrictEqual({ kind: "ok" });
  });

  it.each([
    ")]}'\n",
    ")]}'\n9&[null,",
    ")]}'\n4&null",
    ")]}'\n2&[]",
    framed([null, null, 2, 0, "k"]),
    framed([null, {}, 2]),
    framed([null, [], 2]),
    framed([null, [null], 2]),
    ")]}'\n2&[]garbage",
    ")]}'\n99999999999999999999&[1]",
    `${framed(chunk(null)).slice(0, -1)}`,
  ])(
    "fails on a framed answer that does not show the action done, %j",
    (body) => {
      expect(actionOutcome(answer(body))).toStrictEqual({
        kind: "failed",
        reason: "not an answer",
      });
    }
  );
});
