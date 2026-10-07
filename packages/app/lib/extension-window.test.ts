import { describe, expect, test } from "bun:test";
import { getExtensionWindowError } from "./extension-window";

describe("getExtensionWindowError", () => {
  test("says nothing once the window is open", () => {
    expect(getExtensionWindowError("Bitwarden", "opened")).toBeUndefined();
  });

  test("asks for a restart while the extension isn't loaded", () => {
    expect(getExtensionWindowError("Bitwarden", "notLoaded")).toBe(
      "Bitwarden starts after Meru restarts. Restart Meru, then try again.",
    );
  });

  test("doesn't ask for a restart when a loaded extension's window is refused", () => {
    const error = getExtensionWindowError("Bitwarden", "refused");

    expect(error).toBe("Bitwarden is running, but Meru can't open a window for it.");

    expect(error).not.toContain("Restart");
  });
});
