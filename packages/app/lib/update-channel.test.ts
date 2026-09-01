import { describe, expect, test } from "bun:test";
import { resolveUpdateChannel } from "./update-channel";

const stableVersion = { prerelease: [] };
const prereleaseVersion = { prerelease: ["beta", 2] };

describe("resolveUpdateChannel", () => {
  test("names the stable channel rather than leaving it unset", () => {
    // electron-updater's setter throws on anything but a non-empty string once
    // a channel has been assigned, so switching Beta back to Stable in one
    // session depends on this never being null.
    expect(resolveUpdateChannel("stable", stableVersion).channel).toBe("latest");
  });

  test("passes the prerelease channel through", () => {
    expect(resolveUpdateChannel("beta", stableVersion).channel).toBe("beta");
  });

  test("allows prereleases only on the prerelease channel", () => {
    expect(resolveUpdateChannel("beta", prereleaseVersion).allowPrerelease).toBe(true);
    expect(resolveUpdateChannel("stable", prereleaseVersion).allowPrerelease).toBe(false);
  });

  test("downgrades a prerelease build the moment it leaves the channel", () => {
    expect(resolveUpdateChannel("stable", prereleaseVersion).allowDowngrade).toBe(true);
  });

  test("leaves a stable build on the stable channel with nothing to downgrade to", () => {
    expect(resolveUpdateChannel("stable", stableVersion).allowDowngrade).toBe(false);
  });

  test("never downgrades while the prerelease channel is selected", () => {
    expect(resolveUpdateChannel("beta", prereleaseVersion).allowDowngrade).toBe(false);
  });
});
