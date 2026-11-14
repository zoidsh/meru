import { describe, expect, it } from "vitest";
import { z } from "zod";

import { serializeError } from "./errors.ts";
import { LINE_CAP, logLine, logs, redact, TEXT_CAP } from "./log.ts";

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

describe(redact, () => {
  it("takes out query strings and fragments, credentials and cookie values and email addresses, and keeps the rest", () => {
    expect([
      redact(
        "GET https://mail.google.com/mail/u/0/feed/atom?t=17&at=secret#inbox failed"
      ),
      redact("Authorization: Bearer eyJhbGciOi.payload.sig"),
      redact("authorization=Basic dXNlcjpwYXNz"),
      redact("sent Basic dXNlcjpwYXNz to the proxy"),
      redact("opened https://mail.google.com/mail/u/0/#inbox/FMfcgzQXJWDsKmn"),
      redact("Cookie: SID=abc; GMAIL_AT=xyz"),
      redact("set-cookie=OSID=1; Secure"),
      redact("Signed in as ada.lovelace+meru@example.co.uk"),
      redact("http://127.0.0.1:4100/mail/u/0"),
      redact("node_modules/.pnpm/vitest@5.1.0_@types+node@24.19.2"),
    ]).toStrictEqual([
      "GET https://mail.google.com/mail/u/0/feed/atom?[redacted]#[redacted] failed",
      "Authorization: [redacted]",
      "authorization=[redacted]",
      "sent Basic [redacted] to the proxy",
      "opened https://mail.google.com/mail/u/0/#[redacted]",
      "Cookie: [redacted]",
      "set-cookie=[redacted]",
      "Signed in as [email]",
      "http://127.0.0.1:4100/mail/u/0",
      "node_modules/.pnpm/vitest@5.1.0_@types+node@24.19.2",
    ]);
  });

  it("cuts a long text at the cap", () => {
    expect(redact("x".repeat(TEXT_CAP + 10))).toBe(`${"x".repeat(TEXT_CAP)}…`);
  });
});

describe("logLine's redaction and cap", () => {
  const entry = {
    level: "error",
    message: "A page failed",
    scope: "renderer",
    time: 0,
  } as const;

  it("redacts the text of every field at any depth, an error's message and stack too", () => {
    const error = new Error("fetch https://a.test/x?token=1 for bo@a.test");
    const nested = { at: ["https://a.test/y?q=2"], plain: 3 };
    const { fields } = z
      .object({ fields: z.record(z.string(), z.unknown()) })
      .parse(JSON.parse(logLine({ ...entry, fields: { error, nested } })));
    expect([
      z.object({ message: z.string() }).parse(fields.error).message,
      fields.nested,
    ]).toStrictEqual([
      "fetch https://a.test/x?[redacted] for [email]",
      { at: ["https://a.test/y?[redacted]"], plain: 3 },
    ]);
  });

  it("writes a line past the cap as its envelope and the length its fields made it", () => {
    const fields = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [
        `f${index}`,
        "x".repeat(TEXT_CAP),
      ])
    );
    const line = logLine({ ...entry, fields });
    const written = z
      .object({ fields: z.object({ truncated: z.number() }) })
      .loose()
      .parse(JSON.parse(line));
    expect([
      line.length <= LINE_CAP,
      written.fields.truncated > LINE_CAP,
      written,
    ]).toStrictEqual([
      true,
      true,
      {
        fields: { truncated: written.fields.truncated },
        level: "error",
        message: "A page failed",
        scope: "renderer",
        time: "1970-01-01T00:00:00.000Z",
      },
    ]);
  });

  it("writes a value that holds itself once, marking where it would repeat", () => {
    const loop: { name: string; self?: unknown } = { name: "loop" };
    loop.self = loop;
    expect(JSON.parse(logLine({ ...entry, fields: { loop } }))).toMatchObject({
      fields: { loop: { name: "loop", self: "[circular]" } },
    });
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
