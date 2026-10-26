import { describe, expect, mock, test } from "bun:test";

const currentPlatform = { isMacOS: false, isWindows: false, isLinux: false };

mock.module("@electron-toolkit/utils", () => ({
  platform: currentPlatform,
}));

const { getChromeUserAgent } = await import("./user-agent");

function on(name: "isMacOS" | "isWindows" | "isLinux") {
  currentPlatform.isMacOS = name === "isMacOS";
  currentPlatform.isWindows = name === "isWindows";
  currentPlatform.isLinux = name === "isLinux";
}

describe("getChromeUserAgent", () => {
  test("matches Chrome's reduced user agent on macOS", () => {
    on("isMacOS");

    expect(getChromeUserAgent("152.0.7977.167")).toBe(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    );
  });

  test("matches Chrome's reduced user agent on Windows", () => {
    on("isWindows");

    expect(getChromeUserAgent("152.0.7977.167")).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    );
  });

  test("matches Chrome's reduced user agent on Linux", () => {
    on("isLinux");

    expect(getChromeUserAgent("152.0.7977.167")).toBe(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    );
  });

  test("names no Electron or Meru version", () => {
    on("isMacOS");

    expect(getChromeUserAgent("152.0.7977.167")).not.toMatch(/Electron|Meru/);
  });
});
