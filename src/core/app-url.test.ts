import { describe, expect, it } from "vitest";

import { isSameSite, resolveAppFile } from "./app-url.ts";

const resolve = (url: string) => resolveAppFile(url, "meru-app", ["shell"]);

describe(resolveAppFile, () => {
  it("serves the index for the host's root", () => {
    expect(resolve("meru-app://shell/")).toStrictEqual({
      host: "shell",
      segments: ["index.html"],
    });
    expect(resolve("meru-app://shell")).toStrictEqual({
      host: "shell",
      segments: ["index.html"],
    });
  });

  it("resolves a nested asset, decoding its name", () => {
    expect(resolve("meru-app://shell/assets/my%20font.woff2")).toStrictEqual({
      host: "shell",
      segments: ["assets", "my font.woff2"],
    });
  });

  it("ignores a query and a fragment", () => {
    expect(resolve("meru-app://shell/index.html?v=1#top")).toStrictEqual({
      host: "shell",
      segments: ["index.html"],
    });
  });

  it("keeps a plain `..` inside the host, as URL parsing already folds it", () => {
    expect(resolve("meru-app://shell/../../etc/passwd")).toStrictEqual({
      host: "shell",
      segments: ["etc", "passwd"],
    });
  });

  it("refuses an encoded separator that would climb out", () => {
    expect(resolve("meru-app://shell/a%2f..%2f..%2fsecret")).toBeUndefined();
    expect(resolve("meru-app://shell/%2e%2e%2fsecret")).toBeUndefined();
    expect(resolve("meru-app://shell/a%5c..%5csecret")).toBeUndefined();
  });

  it("refuses a backslash, a drive letter and a null byte", () => {
    expect(resolve(String.raw`meru-app://shell/..\..\secret`)).toBeUndefined();
    expect(resolve("meru-app://shell/C:/Windows/win.ini")).toBeUndefined();
    expect(resolve("meru-app://shell/index.html%00.png")).toBeUndefined();
  });

  it("refuses a malformed escape", () => {
    expect(resolve("meru-app://shell/%E0%A4%A")).toBeUndefined();
  });

  it("refuses another host and another scheme", () => {
    expect(resolve("meru-app://settings/index.html")).toBeUndefined();
    expect(resolve("https://shell/index.html")).toBeUndefined();
    expect(resolve("not a url")).toBeUndefined();
  });
});

describe(isSameSite, () => {
  it("matches the same scheme and host on an app scheme", () => {
    expect(
      isSameSite("meru-app://shell/a.html", "meru-app://shell/index.html")
    ).toBeTruthy();
  });

  it("tells app-scheme hosts apart, which URL.origin cannot", () => {
    expect(
      isSameSite("meru-app://other/index.html", "meru-app://shell/index.html")
    ).toBeFalsy();
  });

  it("tells a dev server's port and scheme apart", () => {
    expect(
      isSameSite("http://127.0.0.1:5173/x", "http://127.0.0.1:5173/")
    ).toBeTruthy();
    expect(
      isSameSite("http://127.0.0.1:5174/", "http://127.0.0.1:5173/")
    ).toBeFalsy();
    expect(
      isSameSite("https://127.0.0.1:5173/", "http://127.0.0.1:5173/")
    ).toBeFalsy();
  });

  it("refuses another scheme and what does not parse", () => {
    expect(
      isSameSite("data:text/plain,shell", "meru-app://shell/")
    ).toBeFalsy();
    expect(isSameSite("::", "meru-app://shell/")).toBeFalsy();
  });
});
