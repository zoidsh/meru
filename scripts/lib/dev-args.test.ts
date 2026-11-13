import { describe, expect, it } from "vitest";

import { splitArgs } from "./dev-args.ts";

describe(splitArgs, () => {
  it("claims --profile and --background and passes the rest to Electron", () => {
    expect(
      splitArgs(
        ["--profile", "work", "--inspect", "--background", "--disable-gpu"],
        {}
      )
    ).toStrictEqual({
      background: true,
      electronArgs: ["--inspect", "--disable-gpu"],
      profile: "work",
    });
    expect(splitArgs(["--profile=home"], {}).profile).toBe("home");
  });

  it("runs in the background when the environment asks", () => {
    expect(splitArgs([], { MERU_BACKGROUND: "1" }).background).toBeTruthy();
    expect(splitArgs([], {}).background).toBeFalsy();
  });

  it("refuses --profile without a name", () => {
    expect(() => splitArgs(["--profile"], {})).toThrow(
      "--profile needs a name"
    );
  });
});
