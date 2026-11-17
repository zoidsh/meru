import { describe, expect, it } from "vitest";

import { unwrapGoogleRedirect } from "./google-redirect.ts";

/** `url` with a password, built so no credential is written in the source. */
const withPassword = (url: string) => {
  const parsed = new URL(url);

  parsed.password = "x";

  return parsed.href;
};

const wrap = (target: string, rest = "&source=gmail&ust=1&usg=x") =>
  `https://www.google.com/url?q=${encodeURIComponent(target)}${rest}`;

describe(unwrapGoogleRedirect, () => {
  it("gives the link Gmail wraps", () => {
    expect(unwrapGoogleRedirect(wrap("https://example.com/a?b=1#c"))).toBe(
      "https://example.com/a?b=1#c"
    );
    expect(unwrapGoogleRedirect(wrap("http://example.com/"))).toBe(
      "http://example.com/"
    );
    expect(
      unwrapGoogleRedirect(
        "https://www.google.com/url?q=https://example.com/&sa=D"
      )
    ).toBe("https://example.com/");
    expect(
      unwrapGoogleRedirect(wrap("https://docs.google.com/document/d/1"))
    ).toBe("https://docs.google.com/document/d/1");
  });

  it("writes the target as the URL parser reads it", () => {
    expect(unwrapGoogleRedirect(wrap("HTTPS://EXAMPLE.COM/A"))).toBe(
      "https://example.com/A"
    );
    expect(unwrapGoogleRedirect(wrap("https://bücher.example/"))).toBe(
      "https://xn--bcher-kva.example/"
    );
    expect(unwrapGoogleRedirect(wrap("https://example%2Ecom/"))).toBe(
      "https://example.com/"
    );
  });

  it("unwraps only www.google.com's /url over https", () => {
    for (const url of [
      "http://www.google.com/url?q=https://example.com/",
      "https://google.com/url?q=https://example.com/",
      "https://www.google.co.uk/url?q=https://example.com/",
      "https://www.google.com.example.com/url?q=https://example.com/",
      "https://example.com/url?q=https://example.com/&google.com/url",
      "https://example.com/?u=https://www.google.com/url?q=https://example.com/",
      "https://www.google.com/URL?q=https://example.com/",
      "https://www.google.com/url/?q=https://example.com/",
      "https://www.google.com/search?q=https://example.com/",
      "https://someone@www.google.com/url?q=https://example.com/",
      withPassword("https://www.google.com/url?q=https://example.com/"),
      "https://www.google.com@example.com/url?q=https://example.com/",
    ]) {
      expect(unwrapGoogleRedirect(url)).toBeUndefined();
    }
  });

  it("unwraps only one q naming a web URL with no credentials", () => {
    for (const url of [
      "https://www.google.com/url",
      "https://www.google.com/url?url=https://example.com/",
      "https://www.google.com/url?q=",
      "https://www.google.com/url?q=https://example.com/&q=https://example.org/",
      "https://www.google.com/url?q=example.com",
      "https://www.google.com/url?q=//example.com/",
      wrap(`${"javascript"}:alert(1)`),
      wrap(`${"JavaScript"}:alert(1)`),
      wrap("data:text/html,hi"),
      wrap("file:///etc/passwd"),
      wrap("mailto:someone@example.com"),
      wrap("ftp://example.com/"),
      wrap("https://someone@example.com/"),
      wrap(withPassword("https://example.com/")),
      wrap("https://www.google.com@example.com/"),
      "not a url",
      "",
    ]) {
      expect(unwrapGoogleRedirect(url)).toBeUndefined();
    }
  });

  it("keeps a redirect inside a redirect wrapped", () => {
    expect(
      unwrapGoogleRedirect(wrap(wrap("https://example.com/")))
    ).toBeUndefined();
  });

  it("never unwraps a link to Google's sign-in or account pages", () => {
    for (const target of [
      "https://accounts.google.com/AddSession",
      "https://ACCOUNTS.GOOGLE.COM/signin",
      "https://accounts%2Egoogle%2Ecom/signin",
      "http://accounts.google.com/",
      "https://accounts.google.com:443/",
      "https://myaccount.google.com/security",
    ]) {
      expect(unwrapGoogleRedirect(wrap(target))).toBeUndefined();
    }

    expect(
      unwrapGoogleRedirect(wrap("https://accounts.google.com.example.com/"))
    ).toBe("https://accounts.google.com.example.com/");
  });
});
