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
        fields: {
          attempt: 3,
          error: { message: "down", name: "Error", stack: error.stack },
          profileId: "p1",
        },
        level: "warn",
        message: "The feed failed",
        scope: "inbox",
        time: "2026-11-14T10:00:00.000Z",
      },
    ]);
  });

  it("keeps the envelope whatever the fields are called, and leaves out fields when there are none", () => {
    const fields: Record<string, unknown> = {
      level: "debug",
      message: "payload did not parse",
      time: "never",
    };
    const entry = {
      level: "warn",
      message: "A request was refused",
      scope: "ipc",
      time: 0,
    } as const;
    expect([
      JSON.parse(logLine({ ...entry, fields })),
      JSON.parse(logLine({ ...entry, fields: {} })),
    ]).toStrictEqual([
      {
        fields: {
          level: "debug",
          message: "payload did not parse",
          time: "never",
        },
        level: "warn",
        message: "A request was refused",
        scope: "ipc",
        time: "1970-01-01T00:00:00.000Z",
      },
      {
        level: "warn",
        message: "A request was refused",
        scope: "ipc",
        time: "1970-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("refuses an envelope key as a field name at compile time", () => {
    const line = logLine({
      // @ts-expect-error A field may not be called `level`.
      fields: { level: "debug" },
      level: "warn",
      message: "m",
      scope: "s",
      time: 0,
    });
    expect(line).toContain('"level":"warn"');
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
