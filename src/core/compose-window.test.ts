import { describe, expect, it } from "vitest";

import { opensCompose } from "./compose-window.ts";
import { composeUrl } from "./mailto.ts";

const GMAIL = "https://mail.google.com/mail/u/0";

describe(opensCompose, () => {
  it.each([
    [
      "Gmail's compose pop-out, as it opens live",
      `${GMAIL}/popout?ver=1#cmid%3D1`,
    ],
    ["the same encoded again", `${GMAIL}/popout?ver=1#cmid%253D2`],
    ["the same decoded", `${GMAIL}/popout?ver=1#cmid=3`],
    [
      "a second account's",
      "https://mail.google.com/mail/u/1/popout?ver=1#cmid%3D1",
    ],
    [
      "Meru's own for an email link",
      composeUrl(GMAIL, "mailto:someone@example.com"),
    ],
  ])("takes %s for compose", (_name, url) => {
    expect(opensCompose(url)).toBeTruthy();
  });

  it.each([
    [
      "a conversation's pop-out",
      `${GMAIL}/popout?ver=1&search=inbox&type=thread&th=%23thread-f%3A1&cvid=1`,
    ],
    ["an attachment's pop-out", `${GMAIL}/popout?ver=1#attid%3D0.1`],
    ["a pop-out with no hash", `${GMAIL}/popout?ver=1`],
    ["View entire message", `${GMAIL}/?ui=2&view=lg&permmsgid=msg-f:1`],
    ["the inbox with a compose hash", `${GMAIL}/#inbox?compose=new`],
    ["a hash that does not decode", `${GMAIL}/popout#%E0%A4%A`],
    ["no URL", "not a url"],
    ["a blank window", "about:blank"],
  ])("does not take %s for compose", (_name, url) => {
    expect(opensCompose(url)).toBeFalsy();
  });
});
