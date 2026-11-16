import { describe, expect, it } from "vitest";

import { readLaunchOptions } from "./launch-options.ts";

const devEnv = {
  MERU_DEV_SERVER_URL: "http://127.0.0.1:5173/",
  MERU_DEV_CSP_NONCE: "abc123",
};

describe(readLaunchOptions, () => {
  it("opens in the background when MERU_BACKGROUND=1 or --background is given", () => {
    expect(
      readLaunchOptions({
        argv: [],
        env: { MERU_BACKGROUND: "1" },
        isDevBuild: false,
      })
    ).toMatchObject({ background: true });
    expect(
      readLaunchOptions({ argv: ["--background"], env: {}, isDevBuild: false })
    ).toMatchObject({ background: true });
    expect(
      readLaunchOptions({ argv: [], env: {}, isDevBuild: false })
    ).toMatchObject({ background: false });
  });

  it("ignores a dev server in a production build", () => {
    expect(
      readLaunchOptions({ argv: [], env: devEnv, isDevBuild: false }).devServer
    ).toBeUndefined();
  });

  it("loads a development build from the dev server it is given", () => {
    expect(
      readLaunchOptions({ argv: [], env: devEnv, isDevBuild: true }).devServer
    ).toStrictEqual({ url: "http://127.0.0.1:5173/", nonce: "abc123" });
  });

  it("refuses a development build with no dev server", () => {
    expect(() =>
      readLaunchOptions({ argv: [], env: {}, isDevBuild: true })
    ).toThrow(/MERU_DEV_SERVER_URL/u);
  });
});
