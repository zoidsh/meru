import { describe, expect, test } from "bun:test";
import { isGoogleUrl } from "./google";

describe("isGoogleUrl", () => {
  test("matches workspace app hosts", () => {
    expect(isGoogleUrl("https://docs.google.com/document/d/abc/edit")).toBe(true);
    expect(isGoogleUrl("https://mail.google.com/mail/u/0/#inbox")).toBe(true);
    expect(isGoogleUrl("https://accounts.google.com/ServiceLogin?service=mail")).toBe(true);
    expect(isGoogleUrl("https://google.com")).toBe(true);
  });

  test("matches user content hosts serving attachments and exports", () => {
    expect(isGoogleUrl("https://doc-0s-4c-docs.googleusercontent.com/viewer/secure/pdf")).toBe(
      true,
    );
    expect(isGoogleUrl("https://googleusercontent.com")).toBe(true);
  });

  test("does not match hosts that only look like google", () => {
    expect(isGoogleUrl("https://notgoogle.com")).toBe(false);
    expect(isGoogleUrl("https://google.com.example.com")).toBe(false);
    expect(isGoogleUrl("https://googleusercontent.com.example.com")).toBe(false);
    expect(isGoogleUrl("https://example.com/?redirect=https://docs.google.com")).toBe(false);
  });

  test("does not match other google top level domains", () => {
    expect(isGoogleUrl("https://www.google.de/search?q=meru")).toBe(false);
  });

  test("does not match unparseable urls", () => {
    expect(isGoogleUrl("about:blank")).toBe(false);
    expect(isGoogleUrl("")).toBe(false);
  });
});
