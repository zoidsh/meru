import { describe, expect, it } from "vitest";

import { answerOf } from "./api.ts";

describe(answerOf, () => {
  it("takes the token from a 200", () => {
    expect(answerOf(200, { token: "a.b.c" })).toStrictEqual({
      ok: true,
      value: { token: "a.b.c" },
    });
  });

  it("returns the reason of a refusal", () => {
    expect(
      answerOf(403, { error: { reason: "unknownLicenseKey" } })
    ).toStrictEqual({
      error: { kind: "rejected", reason: "unknownLicenseKey" },
      ok: false,
    });
  });

  it("names a refusal with no reason by its status", () => {
    expect(answerOf(404, undefined)).toStrictEqual({
      error: { kind: "rejected", reason: "http404" },
      ok: false,
    });
  });

  it.each([
    [500, { token: "a.b.c" }],
    [200, { tolkien: "a.b.c" }],
    [200, undefined],
    [302, undefined],
  ])("calls a %i answering %j a server error", (status, body) => {
    expect(answerOf(status, body)).toMatchObject({
      error: { kind: "serverError" },
      ok: false,
    });
  });
});
