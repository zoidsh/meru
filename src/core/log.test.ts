import { describe, expect, it } from "vitest";

import { recordedLog } from "./log.fake.ts";
import {
  formatLine,
  formatRunLine,
  isKnownHost,
  keepNewerHalf,
  scrub,
  scrubText,
} from "./log.ts";
import type { LogContext } from "./log.ts";
import { newProfile } from "./state.ts";

const HOME = "/Users/ada";

const PROFILES = [
  newProfile("first-id", "Work"),
  {
    ...newProfile("second-id", "Ada Lovelace"),
    tabs: [
      { id: "gmail", app: "gmail", url: "", title: "Inbox (3)" },
      { id: "t2", app: "calendar", url: "", title: "Lunch with Bob" },
    ],
  },
];

const DATA = "/Users/ada/Library/Application Support/Meru";

const context: LogContext = {
  home: HOME,
  dataDir: DATA,
  profiles: () => PROFILES,
};

const line = (fields: Record<string, unknown>) =>
  formatLine(new Date(0), { name: "event", fields }, context);

/** What none of the lines below may hold. */
const PERSONAL = [
  "ada@example.com",
  "lovelace",
  "#search",
  "invoice",
  "secret",
  "Ada Lovelace",
  "Work",
  "Lunch",
  "Bob",
  "/Users/ada",
  "ABCD1234-EFGH-5678",
  "example.org",
  "mail/u/0",
];

const expectClean = (text: string) => {
  for (const personal of PERSONAL) {
    expect(text).not.toContain(personal);
  }
};

describe("the scrubbers", () => {
  it.each([
    [
      "https://mail.google.com/mail/u/0/#search/invoice?q=secret",
      "url=mail.google.com",
    ],
    ["https://example.org/a", 'url="another site"'],
    ["mailto:ada@example.com?subject=secret", "url=mailto:"],
    ["file:///Users/ada/secret.pdf", "url=file:"],
    ["not a url", 'url="a URL"'],
    [undefined, "url=none"],
  ])(
    "write %s as its host alone, or what kind of URL it is",
    (url, written) => {
      expect(line({ url: scrub.host(url) })).toBe(
        `1970-01-01T00:00:00.000Z event ${written}`
      );
    }
  );

  it.each([
    ["mail.google.com", true],
    ["calendar.google.com", true],
    ["accounts.google.com", true],
    ["api.github.com", true],
    ["meru.so", true],
    ["127.0.0.1", true],
    ["example.org", false],
    ["google.com.example.org", false],
  ])(
    "know whether %s is one of Meru's pages, servers or this machine",
    (name, known) => {
      expect(isKnownHost(name)).toBe(known);
    }
  );

  it("name a profile and a tab by their places, never their names or titles", () => {
    const text = line({
      first: scrub.profile("first-id"),
      second: scrub.profile("second-id"),
      gone: scrub.profile("removed-id"),
      gmail: scrub.tab({ profileId: "second-id", tabId: "gmail" }),
      calendar: scrub.tab("second-id/t2"),
      closed: scrub.tab("second-id/t9"),
    });

    expect(text).toBe(
      '1970-01-01T00:00:00.000Z event first="profile 1" second="profile 2" gone="a removed profile" gmail="profile 2 tab 1 gmail" calendar="profile 2 tab 2 calendar" closed="profile 2 a closed tab"'
    );
    expectClean(text);
  });

  it.each([
    [
      "Meru's own folder",
      `${DATA}/state.json`,
      HOME,
      'file="<data>/state.json"',
    ],
    [
      "a file elsewhere under the home folder",
      "/Users/ada/Downloads/invoice.pdf",
      HOME,
      "file=~/…",
    ],
    [
      "a Windows one",
      String.raw`C:\Users\Ada\Documents\state.json`,
      String.raw`C:\Users\Ada`,
      String.raw`file=~\…`,
    ],
  ])("write %s from its folder", (_what, file, home, written) => {
    expect(
      formatLine(
        new Date(0),
        { name: "event", fields: { file: scrub.path(file) } },
        { ...context, home }
      )
    ).toBe(`1970-01-01T00:00:00.000Z event ${written}`);
  });

  it("keep an error code only in the shape Chromium and Node give one", () => {
    expect(line({ code: scrub.code("ERR_NAME_NOT_RESOLVED") })).toContain(
      "code=ERR_NAME_NOT_RESOLVED"
    );
    expect(line({ code: scrub.code(-105) })).toContain("code=-105");
    expect(line({ code: scrub.code("Ada's file") })).toContain("code=other");
  });

  it("scrub what an error carries", () => {
    const error = Object.assign(
      new Error(
        "ENOENT: no such file, open '/Users/ada/Downloads/invoice secret.pdf' for ada@example.com at https://mail.google.com/mail/u/0/#search/secret and getaddrinfo ENOTFOUND example.org, key ABCD1234-EFGH-5678-IJKL"
      ),
      { code: "ENOENT" }
    );
    const text = line({
      error: scrub.error(error),
      raw: error,
      trace: scrub.stack(error),
    });

    expectClean(text);
    expect(text).toContain(
      "ENOENT: no such file, open '~/…' for an address at mail.google.com and getaddrinfo ENOTFOUND another site, key a key (ENOENT)"
    );
  });

  it("refuse a string that was not fixed in the source, at the type level", () => {
    const { log, lines } = recordedLog(context);
    const name = ["Ada", "Lovelace"].join(" ");

    log("tab-closed", { reason: "crashed", count: 2, ok: true });
    // @ts-expect-error -- a name is lowercase words joined by dashes
    log("Tab did not load");
    // @ts-expect-error -- a string made at run time is no event name
    log(name);
    // @ts-expect-error -- nor a template with a placeholder
    log(`profile ${name} added`);
    // @ts-expect-error -- nor a field
    log("profile-added", { name });
    // @ts-expect-error -- nor a field made from a template
    log("profile-added", { name: `${name}!` });
    // @ts-expect-error -- nor an object posing as a scrubbed value
    log("profile-added", { name: { text: name } });

    expect(lines[0]).toBe("tab-closed reason=crashed count=2 ok=true");
    // What got past the types with a cast is not written either.
    expect(lines.slice(1).join("\n")).not.toContain("Ada");
    expect(lines[1]).toBe("unnamed-event");
  });
});

describe("the net under every line", () => {
  it.each([
    [
      "an address in an error message",
      "sent by ada@example.com",
      "sent by an address",
    ],
    ["a file URL", "at file:///Users/ada/secret.pdf", "at file:"],
    [
      "a Gmail URL with a search query",
      "loading 'https://mail.google.com/mail/u/0/#search/invoice?q=secret'",
      "loading 'mail.google.com'",
    ],
    ["a mailto link", "mailto:ada@example.com?subject=secret", "mailto:"],
    [
      "a license-shaped key",
      "the key ABCD1234-EFGH-5678-IJKL",
      "the key a key",
    ],
    ["a UUID", "id 3f2b1c9e-0a4d-4f1e-9c2b-7d8e6f5a4b3c", "id a key"],
    ["the home folder", "at /Users/ada/projects/x", "at ~/…"],
    [
      "another user's folder",
      "open '/home/bob/x y.pdf' failed",
      "open '~/…' failed",
    ],
    [
      "a Windows home folder",
      String.raw`at C:\Users\Bob\x`,
      String.raw`at ~\…`,
    ],
    [
      "Meru's own folder",
      `open '${DATA}/state.json'`,
      "open '<data>/state.json'",
    ],
  ])("scrubs %s", (_what, text, scrubbedText) => {
    expect(scrubText(text, context)).toBe(scrubbedText);
  });

  it("leaves Meru's own words, files and stacks alone", () => {
    for (const text of [
      "tab-load-failed host=mail.google.com code=-105",
      "at Object.focus (index.js:12:3)",
      "saved state.json and main.log, Meru.app 4.2.0-beta.3",
      "ERR_NAME_NOT_RESOLVED (-105)",
      "command-refused command=inbox.toggle",
    ]) {
      expect(scrubText(text, context)).toBe(text);
    }
  });
});

describe("a run's first line", () => {
  it("says what wrote the rest", () => {
    expect(
      formatRunLine(
        new Date(0),
        {
          productName: "Meru",
          version: "4.0.0",
          build: "prod",
          os: "darwin",
          osVersion: "26.2.0",
          arch: "arm64",
          electron: "45.2.3",
        },
        context
      )
    ).toBe(
      '1970-01-01T00:00:00.000Z run-started app="Meru 4.0.0" build=prod os="darwin 26.2.0" arch=arm64 electron=45.2.3'
    );
  });
});

const lines = (from: number, to: number) =>
  Array.from(
    { length: to - from },
    (_, index) => `line ${from + index}\n`
  ).join("");

describe("the cap", () => {
  it("leaves a log at or under the cap as it is", () => {
    const text = lines(0, 10);

    expect(keepNewerHalf(text, text.length)).toBe(text);
  });

  it("keeps the newer half of one past it, from a whole line", () => {
    const text = lines(0, 100);
    const kept = keepNewerHalf(text, 400);

    expect(kept.endsWith("line 99\n")).toBeTruthy();
    expect(kept.startsWith("line ")).toBeTruthy();
    expect(new TextEncoder().encode(kept).length).toBeLessThanOrEqual(200);
    expect(text.endsWith(kept)).toBeTruthy();
  });

  it("cuts at a line, never inside a character of several bytes", () => {
    const text = `${"é".repeat(300)}\nlast\n`;

    expect(keepNewerHalf(text, 100)).toBe("last\n");
  });
});
