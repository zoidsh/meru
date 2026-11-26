import { describe, expect, it } from "vitest";

import {
  composeUrl,
  incomingUrlsOf,
  isMailtoUrl,
  MAILTO_MAX_LENGTH,
  schemeOf,
} from "./mailto.ts";

const GMAIL_HOME = "https://mail.google.com/mail/u/0";

describe(isMailtoUrl, () => {
  it("takes a mailto link, its scheme in any case", () => {
    expect(isMailtoUrl("mailto:someone@example.com?subject=Hi")).toBeTruthy();
    expect(isMailtoUrl("MAILTO:someone@example.com")).toBeTruthy();
    expect(isMailtoUrl("MailTo:someone@example.com")).toBeTruthy();
  });

  it("takes one with no address, which Gmail opens empty", () => {
    expect(isMailtoUrl("mailto:")).toBeTruthy();
    expect(isMailtoUrl("mailto:?subject=Hello")).toBeTruthy();
  });

  it("takes non-ASCII text, which the address encodes", () => {
    expect(isMailtoUrl("mailto:josé@exämple.com?subject=Grüße")).toBeTruthy();
  });

  it("refuses a URL that only contains mailto: further on", () => {
    expect(
      isMailtoUrl("https://example.com/?u=mailto:a@example.com")
    ).toBeFalsy();
    expect(isMailtoUrl(" mailto:a@example.com")).toBeFalsy();
    expect(isMailtoUrl("xmailto:a@example.com")).toBeFalsy();
    expect(isMailtoUrl("mailto")).toBeFalsy();
    expect(isMailtoUrl("")).toBeFalsy();
  });

  it("refuses one longer than the cap, and takes one at it", () => {
    const at = `mailto:a@example.com?body=${"x".repeat(MAILTO_MAX_LENGTH - 26)}`;

    expect(at).toHaveLength(MAILTO_MAX_LENGTH);
    expect(isMailtoUrl(at)).toBeTruthy();
    expect(isMailtoUrl(`${at}x`)).toBeFalsy();
  });

  it("refuses control characters, raw line breaks among them", () => {
    expect(isMailtoUrl("mailto:a@example.com\nbcc:b@example.com")).toBeFalsy();
    expect(isMailtoUrl("mailto:a@example.com\r")).toBeFalsy();
    expect(isMailtoUrl("mailto:a@example.com\u0000")).toBeFalsy();
    expect(isMailtoUrl("mailto:a@example.com\u0085")).toBeFalsy();
    expect(isMailtoUrl("mailto:a@example.com?body=Line%0Atwo")).toBeTruthy();
  });

  it("refuses a lone surrogate, which no compose address can encode", () => {
    expect(isMailtoUrl("mailto:\uD800")).toBeFalsy();
    expect(isMailtoUrl("mailto:a@example.com?subject=\uDC00")).toBeFalsy();
    expect(isMailtoUrl("mailto:a@example.com?subject=😀")).toBeTruthy();
    expect(() =>
      composeUrl(GMAIL_HOME, "mailto:a@example.com?subject=😀")
    ).not.toThrow();
  });
});

describe(composeUrl, () => {
  it("hands Gmail the whole link, encoded", () => {
    expect(
      composeUrl(
        GMAIL_HOME,
        "mailto:someone@example.com?subject=Hello&cc=other@example.com&body=Line%20one"
      )
    ).toBe(
      "https://mail.google.com/mail/u/0/?extsrc=mailto&url=mailto%3Asomeone%40example.com%3Fsubject%3DHello%26cc%3Dother%40example.com%26body%3DLine%2520one"
    );
  });

  it("keeps the scheme as the link wrote it, and encodes non-ASCII as UTF-8", () => {
    expect(composeUrl(GMAIL_HOME, "MAILTO:josé@example.com")).toBe(
      "https://mail.google.com/mail/u/0/?extsrc=mailto&url=MAILTO%3Ajos%C3%A9%40example.com"
    );
  });

  it("goes under a home with or without its slash", () => {
    expect(composeUrl("http://127.0.0.1:5/gmail/", "mailto:")).toBe(
      "http://127.0.0.1:5/gmail/?extsrc=mailto&url=mailto%3A"
    );
    expect(composeUrl("http://127.0.0.1:5/gmail", "mailto:")).toBe(
      "http://127.0.0.1:5/gmail/?extsrc=mailto&url=mailto%3A"
    );
  });
});

describe(schemeOf, () => {
  it("names the scheme alone, lowercased", () => {
    expect(schemeOf("MAILTO:a@example.com")).toBe("mailto");
    expect(schemeOf("https://example.com/secret")).toBe("https");
    expect(schemeOf("meru://open?x=1")).toBe("meru");
  });

  it("names none for what has no scheme", () => {
    expect(schemeOf("a@example.com")).toBe("none");
    expect(schemeOf(String.raw`C:\Program Files\Meru\Meru.exe`)).toBe("none");
  });
});

describe(incomingUrlsOf, () => {
  it("finds each URL among a launch's arguments, in order", () => {
    expect(
      incomingUrlsOf([
        String.raw`C:\Users\a\AppData\Local\Programs\Meru\Meru.exe`,
        "--allow-file-access-from-files",
        "mailto:a@example.com",
        "--original-process-start-time=1",
        "https://example.com/",
        "MAILTO:b@example.com",
      ])
    ).toStrictEqual([
      "mailto:a@example.com",
      "https://example.com/",
      "MAILTO:b@example.com",
    ]);
  });

  it("finds none where a launch carries no link", () => {
    expect(
      incomingUrlsOf([
        "/usr/bin/meru",
        "/opt/Meru/resources/app.asar",
        "-psn_0_1",
      ])
    ).toStrictEqual([]);
  });
});
