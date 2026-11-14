import { describe, expect, it } from "vitest";

import { serializeError } from "./errors.ts";
import { logLine, logs } from "./log.ts";

describe(serializeError, () => {
  it("keeps an error's name, message and stack, and the text of anything else thrown", () => {
    const error = new TypeError("bad");
    expect([
      serializeError(error),
      serializeError("plain"),
      serializeError({ code: 7 }),
      serializeError(undefined).name,
    ]).toStrictEqual([
      { message: "bad", name: "TypeError", stack: error.stack },
      { message: "plain", name: "NonError" },
      { message: '{"code":7}', name: "NonError" },
      "NonError",
    ]);
  });
});

describe(logLine, () => {
  it("writes one JSON line with the time, level, scope and message, and every field, an error as its name, message and stack", () => {
    const error = new Error("down");
    const line = logLine({
      fields: { attempt: 3, error, profileId: "p1" },
      level: "warn",
      message: "The feed failed",
      scope: "inbox",
      time: Date.parse("2026-11-14T10:00:00Z"),
    });
    expect([line.endsWith("\n"), JSON.parse(line)]).toStrictEqual([
      true,
      {
        attempt: 3,
        error: { message: "down", name: "Error", stack: error.stack },
        level: "warn",
        message: "The feed failed",
        profileId: "p1",
        scope: "inbox",
        time: "2026-11-14T10:00:00.000Z",
      },
    ]);
  });
});

describe(logs, () => {
  it("keeps a level at or above the minimum", () => {
    expect([
      logs("debug", "info"),
      logs("info", "info"),
      logs("error", "warn"),
    ]).toStrictEqual([false, true, true]);
  });
});
