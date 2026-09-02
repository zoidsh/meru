import { describe, expect, test } from "bun:test";
import { serializeErrorDetails } from "./log-details";

describe("serializeErrorDetails", () => {
  test("leaves the error key out when the caller passed none", () => {
    const details = serializeErrorDetails({
      sourceUrl: "chrome-extension://abc/background.js",
      message: "Session does not exist for tab 3",
    });

    expect(details).toEqual({
      sourceUrl: "chrome-extension://abc/background.js",
      message: "Session does not exist for tab 3",
    });
    expect("error" in details).toBe(false);
  });

  test("serializes an error the caller did pass, alongside the rest", () => {
    const details = serializeErrorDetails({
      extensionDir: "/extensions/1password",
      error: new Error("No manifest.json"),
    });

    expect(details.extensionDir).toBe("/extensions/1password");
    expect(details.error).toMatchObject({ name: "Error", message: "No manifest.json" });
  });

  test("serializes a non-error value the caller did pass", () => {
    expect(serializeErrorDetails({ error: "boom" }).error).toMatchObject({
      name: "NonError",
      message: "Non-error value: boom",
    });
  });
});
