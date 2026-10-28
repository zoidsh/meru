import { afterEach, expect, mock, test } from "bun:test";
import { GMAIL_URL } from "@meru/shared/gmail";

// The module logs through electron-log, which wants an Electron app that does
// not exist here.
mock.module("@/lib/log", () => ({
  log: { warn: () => {} },
}));

const { resolveGmailUrl } = await import("./url");

const inheritedGmailUrl = process.env.MERU_E2E_GMAIL_URL;

function setGmailUrl(value: string | undefined) {
  if (value === undefined) {
    delete process.env.MERU_E2E_GMAIL_URL;
  } else {
    process.env.MERU_E2E_GMAIL_URL = value;
  }
}

afterEach(() => {
  setGmailUrl(inheritedGmailUrl);
});

test("resolves to Gmail when the override is unset", () => {
  setGmailUrl(undefined);

  expect(resolveGmailUrl()).toBe(GMAIL_URL);
});

test("resolves to a loopback override", () => {
  setGmailUrl("http://127.0.0.1:49152/gmail/u/0");

  expect(resolveGmailUrl()).toBe("http://127.0.0.1:49152/gmail/u/0");

  setGmailUrl("http://localhost:49152/gmail/u/0");

  expect(resolveGmailUrl()).toBe("http://localhost:49152/gmail/u/0");

  setGmailUrl("http://[::1]:49152/gmail/u/0");

  expect(resolveGmailUrl()).toBe("http://[::1]:49152/gmail/u/0");
});

test.each([
  "https://mail.google.com.evil.example/mail/u/0",
  "http://127.0.0.1.evil.example/",
  "file:///etc/hosts",
  "javascript:alert(1)",
  "not a url",
  "",
])("ignores %p", (url) => {
  setGmailUrl(url);

  expect(resolveGmailUrl()).toBe(GMAIL_URL);
});
