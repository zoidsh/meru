import { describe, expect, test } from "bun:test";
import { ms } from "@meru/shared/ms";
import { decide, lockedElectron, reasons } from "./electron-upgrade";

const hour = ms("1h");
const now = new Date("2026-11-01T00:00:00.000Z");
const ago = (hours: number) => new Date(now.getTime() - hours * hour).toISOString();

/** `decide` with every key of `time` still published, unless `versions` says otherwise. */
function decideListed(
  args: Omit<Parameters<typeof decide>[0], "versions"> & { versions?: unknown },
) {
  const listed = typeof args.time === "object" && args.time !== null ? Object.keys(args.time) : [];

  return decide({ versions: listed, ...args });
}

describe("decide", () => {
  test("skips a version npm still dates but no longer lists, as after an unpublish", () => {
    expect(
      decideListed({
        time: { "45.1.0": ago(100), "45.2.0": ago(80), "45.3.0": ago(60) },
        versions: ["45.1.0", "45.2.0"],
        current: "45.1.0",
        now,
      }),
    ).toEqual({ kind: "upgrade", target: "45.2.0" });
  });

  test("skips npm's created and modified keys", () => {
    expect(
      decideListed({
        time: { created: ago(1), modified: ago(1), "45.1.0": ago(100) },
        current: "45.1.0",
        now,
      }),
    ).toEqual({ kind: "current" });
  });

  test("skips prereleases, however old", () => {
    expect(
      decideListed({
        time: { "45.1.0": ago(100), "45.2.0-beta.1": ago(100), "46.0.0-alpha.3": ago(100) },
        current: "45.1.0",
        now,
      }),
    ).toEqual({ kind: "current" });
  });

  test("never offers a newer major, and names it", () => {
    const decision = decideListed({
      time: { "45.1.0": ago(100), "46.0.0": ago(50), "46.1.0": ago(30) },
      current: "45.1.0",
      now,
    });

    expect(decision).toEqual({ kind: "current", newerMajor: "46.1.0" });
    expect(reasons(decision, "45.1.0").join("\n")).toContain("46.1.0 is a new major");
  });

  test("holds a release younger than the minimum age, and says when it clears", () => {
    const decision = decideListed({
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
    const decision = decideListed({
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
    const decision = decideListed({
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
      decideListed({
        time: { "45.10.0": ago(30), "45.1.0": ago(100), "45.9.2": ago(60), "45.2.0": ago(80) },
        current: "45.1.0",
        now,
      }),
    ).toEqual({ kind: "upgrade", target: "45.10.0" });
  });

  test("honors a different minimum age", () => {
    expect(
      decideListed({
        time: { "45.1.0": ago(100), "45.2.0": ago(6) },
        current: "45.1.0",
        now,
        minAgeHours: 4,
      }),
    ).toEqual({ kind: "upgrade", target: "45.2.0" });
  });

  test("fails on malformed input rather than deciding", () => {
    expect(() => decideListed({ time: [], current: "45.1.0", now })).toThrow("not an object");
    expect(() => decideListed({ time: null, current: "45.1.0", now })).toThrow("not an object");
    expect(() => decideListed({ time: { "45.2.0": "yesterday" }, current: "45.1.0", now })).toThrow(
      "Electron 45.2.0 has no readable publish time",
    );
    expect(() => decideListed({ time: { "45.2.0": 12 }, current: "45.1.0", now })).toThrow(
      "no readable publish time",
    );
    expect(() => decideListed({ time: {}, current: "^45.1.0", now })).toThrow(
      "Not a stable Electron version",
    );
    expect(() =>
      decideListed({ time: { "45.2.0": ago(30) }, versions: "45.2.0", current: "45.1.0", now }),
    ).toThrow("not a list of version strings");
    expect(() =>
      decideListed({ time: { "45.2.0": ago(30) }, versions: [45], current: "45.1.0", now }),
    ).toThrow("not a list of version strings");
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
