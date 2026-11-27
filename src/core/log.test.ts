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
    ["Meru's own folder", `${DATA}/state.json`, "file=<data>/state.json"],
    [
      "a file elsewhere under the home folder",
      "/Users/ada/Downloads/invoice.pdf",
      'file="a path"',
    ],
    [
      "a Windows one",
      String.raw`C:\Users\Ada\Documents\state.json`,
      'file="a path"',
    ],
  ])("write %s by its folder, or as a path", (_what, file, written) => {
    expect(line({ file: scrub.path(file) })).toBe(
      `1970-01-01T00:00:00.000Z event ${written}`
    );
  });

  it("keep an error code only in the shape Chromium and Node give one, and an error's code without its message", () => {
    const loadError = Object.assign(
      new Error(
        "ERR_FAILED (-2) loading 'https://mail.google.com/mail/u/0/#search/(Ada)Lovelace'"
      ),
      { code: "ERR_FAILED", errno: -2 }
    );

    expect(
      line({
        named: scrub.code("ERR_NAME_NOT_RESOLVED"),
        numbered: scrub.code(-105),
        typed: scrub.code("Ada's file"),
        load: scrub.code(loadError),
        bare: scrub.code(new Error("open '/Users/ada/invoice.pdf'")),
      })
    ).toBe(
      "1970-01-01T00:00:00.000Z event named=ERR_NAME_NOT_RESOLVED numbered=-105 typed=other load=ERR_FAILED bare=other"
    );
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
      "ENOENT: no such file, open 'a path' for an address at mail.google.com and getaddrinfo ENOTFOUND another site, key a key (ENOENT)"
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
    const parsed = JSON.parse('"Ada Lovelace"');
    // @ts-expect-error -- nor `any`, which would pass for anything
    log("profile-added", { name: parsed });

    expect(lines[0]).toBe("tab-closed reason=crashed count=2 ok=true");
    // What got past the types with a cast is not written either.
    expect(lines.slice(1).join("\n")).not.toContain("Ada");
    expect(lines[1]).toBe("unnamed-event");
  });
});

describe("the net under every field", () => {
  it.each([
    [
      "an address in an error message",
      "sent by ada@example.com",
      "sent by an address",
    ],
    [
      "an address of other letters",
      "sent by zoë@exämple.de",
      "sent by an address",
    ],
    [
      "an address with a quoted name",
      'sent by "ada lovelace"@example.com',
      "sent by an address",
    ],
    ["a file URL", "at file:///Users/ada/secret.pdf", "at file:"],
    [
      "a Gmail URL with a search query",
      "loading 'https://mail.google.com/mail/u/0/#search/invoice?q=secret'",
      "loading 'mail.google.com'",
    ],
    [
      "a URL whose search holds brackets and commas",
      "loading 'https://mail.google.com/mail/u/0/#search/(Ada),Lovelace'",
      "loading 'mail.google.com'",
    ],
    ["a mailto link", "mailto:ada@example.com?subject=secret", "mailto:"],
    [
      "a license-shaped key",
      "the key ABCD1234-EFGH-5678-IJKL",
      "the key a key",
    ],
    ["a UUID", "id 3f2b1c9e-0a4d-4f1e-9c2b-7d8e6f5a4b3c", "id a key"],
    ["the home folder", "at /Users/ada/projects/x", "at a path"],
    [
      "a quoted folder with spaces",
      "open '/home/bob/x y.pdf' failed",
      "open 'a path' failed",
    ],
    ["a Windows home folder", String.raw`at C:\Users\Bob\x`, "at a path"],
    [
      "a Windows path quoted, with spaces",
      String.raw`EPERM: rename 'C:\Users\Ada Lovelace\Documents\x.tmp' -> 'C:\Users\Ada Lovelace\Documents\x'`,
      "EPERM: rename 'a path' -> 'a path'",
    ],
    ["a drive written with slashes", "at D:/Taxes/2025.pdf", "at a path"],
    ["a share", String.raw`at \\nas\Ada\Taxes and more`, "at a path and more"],
    ["a disk", "'/Volumes/Ada Backup/x' gone", "'a path' gone"],
    ["a temporary folder", "at /private/var/folders/x/y", "at a path"],
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
      "host=mail.google.com code=-105",
      "at Object.focus (index.js:12:3)",
      "at focus (<app>/out/main.mjs:12:3)",
      "at file:<app>/out/main.mjs:12:3",
      "at process.processTicksAndRejections (node:internal/process/task_queues:95:5)",
      "saved state.json and main.log, Meru.app 4.2.0-beta.3",
      "ERR_NAME_NOT_RESOLVED (-105)",
      "on 2026/11/27, 1/2 done",
    ]) {
      expect(scrubText(text, context)).toBe(text);
    }
  });

  it("writes an app's own frames from its folder", () => {
    expect(
      scrubText(
        "at focus (/Applications/Meru.app/Contents/Resources/app.asar/out/main.mjs:12:3)",
        { appDir: "/Applications/Meru.app/Contents/Resources/app.asar" }
      )
    ).toBe("at focus (<app>/out/main.mjs:12:3)");
  });
});

const errorLine = (message: string) =>
  line({ error: scrub.error(new Error(message)) });

describe("an error's text", () => {
  it.each([
    [
      "getaddrinfo ENOTFOUND MyBank.Example",
      "getaddrinfo ENOTFOUND another site",
    ],
    [
      "fetch mybank.example/statements?id=42 failed",
      "fetch another site failed",
    ],
    [
      "could not reach ada.app or ada.so",
      "could not reach another site or another site",
    ],
    ["reached mail.google.com", "reached mail.google.com"],
    ["no host bank.example.", "no host another site."],
  ])("scrubs a host with no scheme: %s", (message, written) => {
    expect(errorLine(message)).toBe(
      `1970-01-01T00:00:00.000Z event error=${JSON.stringify(written)}`
    );
  });

  it("leaves Meru's dotted ids and file names", () => {
    const message =
      "inbox.toggle, view.reload is not a function, com.apple.quarantine, 2025.pdf";

    expect(errorLine(message)).toBe(
      `1970-01-01T00:00:00.000Z event error=${JSON.stringify(message)}`
    );
  });
});

describe("the order of a field's scrubbing", () => {
  const WINDOWS_DATA = String.raw`C:\Users\Ada Lovelace\AppData\Roaming\Meru`;
  const windows: LogContext = { ...context, dataDir: WINDOWS_DATA };

  it("scrubs a Windows path with a space before quoting doubles its backslashes", () => {
    const error = Object.assign(
      new Error(
        String.raw`EPERM: operation not permitted, rename 'C:\Users\Ada Lovelace\Documents\x.tmp' -> 'C:\Users\Ada Lovelace\Documents\x'`
      ),
      { code: "EPERM" }
    );
    const text = formatLine(
      new Date(0),
      { name: "event", fields: { error: scrub.error(error) } },
      windows
    );

    expect(text).not.toContain("Lovelace");
    expect(text).toContain("'a path' -> 'a path'");
  });

  it("writes a file in a data folder with a space by its folder", () => {
    const text = formatLine(
      new Date(0),
      {
        name: "store-set-aside",
        fields: { file: scrub.path(String.raw`${WINDOWS_DATA}\state.json`) },
      },
      windows
    );

    expect(text).toBe(
      String.raw`1970-01-01T00:00:00.000Z store-set-aside file=<data>\state.json`
    );
  });

  it("scrubs an address the cut would split", () => {
    const text = line({
      error: scrub.error(new Error(`${"x ".repeat(997)}ada@example.com`)),
    });

    expect(text).not.toContain("ada@");
    expect(text).not.toContain("example");
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
