import { describe, expect, test } from "bun:test";
import { ms } from "@meru/shared/ms";
import { decide, lockedElectron, reasons } from "./electron-upgrade";

const hour = ms("1h");
const now = new Date("2026-11-01T00:00:00.000Z");
const ago = (hours: number) => new Date(now.getTime() - hours * hour).toISOString();

describe("decide", () => {
  test("skips npm's created and modified keys", () => {
    expect(
      decide({
        time: { created: ago(1), modified: ago(1), "45.1.0": ago(100) },
        current: "45.1.0",
        now,
      }),
    ).toEqual({ kind: "current" });
  });

  test("skips prereleases, however old", () => {
    expect(
      decide({
        time: { "45.1.0": ago(100), "45.2.0-beta.1": ago(100), "46.0.0-alpha.3": ago(100) },
        current: "45.1.0",
        now,
      }),
    ).toEqual({ kind: "current" });
  });

  test("never offers a newer major, and names it", () => {
    const decision = decide({
      time: { "45.1.0": ago(100), "46.0.0": ago(50), "46.1.0": ago(30) },
      current: "45.1.0",
      now,
    });

    expect(decision).toEqual({ kind: "current", newerMajor: "46.1.0" });
    expect(reasons(decision, "45.1.0").join("\n")).toContain("46.1.0 is a new major");
  });

  test("holds a release younger than the minimum age, and says when it clears", () => {
    const decision = decide({
      time: { "45.1.0": ago(100), "45.2.0": ago(6) },
      current: "45.1.0",
      now,
    });

    expect(decision).toMatchObject({
      kind: "held",
      young: { version: "45.2.0" },
      clearsAt: new Date(now.getTime() + 18 * hour),
    });
    expect(reasons(decision, "45.1.0")[0]).toBe(
      `Holding: Electron 45.2.0 was published at ${ago(6)}, under 24 hours ago, and clears at 2026-11-01T18:00:00.000Z.`,
    );
  });

  test("holds even when an older candidate is old enough", () => {
    const decision = decide({
      time: { "45.1.0": ago(100), "45.1.1": ago(48), "45.2.0": ago(2) },
      current: "45.1.0",
      now,
    });

    expect(decision).toMatchObject({
      kind: "held",
      young: { version: "45.2.0" },
      olderEligible: "45.1.1",
    });
    expect(reasons(decision, "45.1.0")[1]).toContain("45.1.1 is old enough");
  });

  test("reports the current version as the newest", () => {
    const decision = decide({
      time: { "45.1.0": ago(100), "45.2.0": ago(30) },
      current: "45.2.0",
      now,
    });

    expect(decision).toEqual({ kind: "current" });
    expect(reasons(decision, "45.2.0")).toEqual([
      "Electron 45.2.0 is the newest stable release in its major.",
    ]);
  });

  test("takes the newest candidate when every one is old enough", () => {
    expect(
      decide({
        time: { "45.10.0": ago(30), "45.1.0": ago(100), "45.9.2": ago(60), "45.2.0": ago(80) },
        current: "45.1.0",
        now,
      }),
    ).toEqual({ kind: "upgrade", target: "45.10.0" });
  });

  test("honors a different minimum age", () => {
    expect(
      decide({
        time: { "45.1.0": ago(100), "45.2.0": ago(6) },
        current: "45.1.0",
        now,
        minAgeHours: 4,
      }),
    ).toEqual({ kind: "upgrade", target: "45.2.0" });
  });

  test("fails on malformed input rather than deciding", () => {
    expect(() => decide({ time: [], current: "45.1.0", now })).toThrow("not an object");
    expect(() => decide({ time: null, current: "45.1.0", now })).toThrow("not an object");
    expect(() => decide({ time: { "45.2.0": "yesterday" }, current: "45.1.0", now })).toThrow(
      "Electron 45.2.0 has no readable publish time",
    );
    expect(() => decide({ time: { "45.2.0": 12 }, current: "45.1.0", now })).toThrow(
      "no readable publish time",
    );
    expect(() => decide({ time: {}, current: "^45.1.0", now })).toThrow(
      "Not a stable Electron version",
    );
  });
});

describe("lockedElectron", () => {
  test("reads the resolved version from bun.lock's JSONC", () => {
    const lock = `{
      "lockfileVersion": 1,
      "packages": {
        "@electron-toolkit/utils": ["@electron-toolkit/utils@4.0.0", "", { "peerDependencies": { "electron": ">=13.0.0" } }, "sha512-x"],
        "electron": ["electron@45.1.0", "", {}, "sha512-y"],
      },
    }`;

    expect(lockedElectron(lock)).toBe("45.1.0");
  });

  test("fails when the lock resolves no electron", () => {
    expect(() => lockedElectron(`{ "packages": {} }`)).toThrow(
      "bun.lock resolves no stable electron",
    );
  });
});
