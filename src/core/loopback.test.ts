import { describe, expect, it } from "vitest";

import { staysOnMachine } from "./loopback.ts";

describe(staysOnMachine, () => {
  it("lets loopback and the schemes that reach no network through, and nothing else", () => {
    expect(
      [
        "http://127.0.0.1:4000/mail/u/0/",
        "ws://localhost:5173/",
        "http://[::1]:8080/",
        "meru-app://shell/index.html",
        "data:text/plain,hi",
        "devtools://devtools/bundled/inspector.html",
        "https://docs.google.com/",
        "http://127.0.0.2.example.com/",
        "wss://mail.google.com/",
        "not a url",
      ].map(staysOnMachine)
    ).toStrictEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });
});
