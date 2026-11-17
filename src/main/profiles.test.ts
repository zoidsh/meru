import { describe, expect, it } from "vitest";

import { decodeState, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createProfiles } from "./profiles.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Profile 2")],
  selectedProfileId: "b",
};

const describeState = (state: State) =>
  `${state.profiles.map((profile) => profile.id).join(",")} to clear [${(state.profilesToClear ?? []).join(",")}]`;

/**
 * Profiles over fakes that record each step in one log, in order, and fail
 * at the step named.
 */
const setup = ({
  initial = two,
  failSave = false,
  failView = false,
  failClear = [],
  now = 0,
}: {
  initial?: State;
  /** What the clock reads, in milliseconds since the epoch. */
  now?: number;
  failSave?: boolean;
  failView?: boolean;
  /** Partitions whose clear fails. */
  failClear?: string[];
} = {}) => {
  const steps: string[] = [];
  const logs: string[] = [];
  const saved: State[] = [];
  let ids = 0;

  const profiles = createProfiles({
    initial,
    save: (state) => {
      steps.push(`save ${describeState(state)}`);
      saved.push(state);

      return failSave
        ? Promise.reject(new Error("disk full"))
        : Promise.resolve();
    },
    newId: () => {
      ids += 1;

      return `new-${ids}`;
    },
    profileName: (n) => `Profile ${n}`,
    clearSession: (partition) => {
      steps.push(`clear ${partition}`);

      return failClear.includes(partition)
        ? Promise.reject(new Error("locked"))
        : Promise.resolve();
    },
    now: () => now,
    log: (message) => logs.push(message),
  });

  // Stands in for the view manager, which closes a removed profile's view.
  profiles.onChange((state) => {
    steps.push(
      `views ${state.profiles.map((profile) => profile.id).join(",")}`
    );

    if (failView) {
      throw new Error("view gone wrong");
    }
  });

  return { profiles, steps, logs, saved };
};

describe(createProfiles, () => {
  it("adds a profile with a new id and the next name, selected, saved before it shows", async () => {
    const { profiles, steps } = setup();

    await expect(profiles.add()).resolves.toBeTruthy();

    expect(profiles.get().profiles.at(-1)).toStrictEqual(
      newProfile("new-1", "Profile 3")
    );
    expect(profiles.get().selectedProfileId).toBe("new-1");
    expect(steps).toStrictEqual([
      "save a,b,new-1 to clear []",
      "views a,b,new-1",
    ]);
  });

  it("selects another listed profile, and writes nothing for the selected one or an unknown one", async () => {
    const { profiles, steps } = setup();

    await expect(profiles.select("a")).resolves.toBeTruthy();
    await expect(profiles.select("a")).resolves.toBeFalsy();
    await expect(profiles.select("missing")).resolves.toBeFalsy();

    expect(profiles.get().selectedProfileId).toBe("a");
    expect(steps).toStrictEqual(["save a,b to clear []", "views a,b"]);
  });

  it("removes a profile by saving it onto the list to clear, closing its view, clearing its data, then taking it off the list", async () => {
    const { profiles, steps, logs } = setup();

    await expect(profiles.remove("b")).resolves.toBeTruthy();

    expect(profiles.get()).toStrictEqual({
      ...two,
      profiles: [newProfile("a", "Default")],
      selectedProfileId: "a",
      profilesToClear: [],
    });
    expect(steps).toStrictEqual([
      "save a to clear [b]",
      "views a",
      "clear persist:b",
      "save a to clear []",
      "views a",
    ]);
    expect(logs).toStrictEqual([]);
  });

  it("never clears the data of an id an unreadable entry still holds when a readable profile of that id is removed", async () => {
    const decoded = decodeState({
      version: 1,
      profiles: [
        { id: "a", name: "A" },
        { id: "a", name: 5 },
        { id: "b", name: "B" },
      ],
      selectedProfileId: "b",
    });

    if (decoded.kind !== "read") {
      throw new Error(decoded.kind);
    }

    const { profiles, steps, logs } = setup({ initial: decoded.value });

    await expect(profiles.remove("a")).resolves.toBeTruthy();

    expect(steps).not.toContain("clear persist:a");
    expect(profiles.get().profilesToClear).toStrictEqual([]);
    expect(logs).toStrictEqual([
      "Kept the data of profile a, which was on the list to clear but is still listed",
    ]);
  });

  it("refuses to remove the last profile and touches nothing", async () => {
    const { profiles, steps } = setup();

    await profiles.remove("b");
    steps.length = 0;

    await expect(profiles.remove("a")).resolves.toBeFalsy();
    expect(profiles.get().profiles).toHaveLength(1);
    expect(steps).toStrictEqual([]);
  });

  it("keeps the profile listed and its data whole when the save fails", async () => {
    const { profiles, steps } = setup({ failSave: true });

    await expect(profiles.remove("b")).rejects.toThrow("disk full");

    expect(profiles.get()).toStrictEqual(two);
    expect(steps).toStrictEqual(["save a to clear [b]"]);
  });

  it("still clears the data, and logs, when closing the view fails", async () => {
    const { profiles, steps, logs } = setup({ failView: true });

    await expect(profiles.remove("b")).resolves.toBeTruthy();

    expect(steps).toContain("clear persist:b");
    expect(profiles.get().profilesToClear).toStrictEqual([]);
    expect(logs).toContain("A profiles listener failed: view gone wrong");
  });

  it("keeps a profile whose clear fails on the list, and logs where its data was left", async () => {
    const { profiles, logs } = setup({ failClear: ["persist:b"] });

    await expect(profiles.remove("b")).resolves.toBeTruthy();

    expect(profiles.get().profiles).toStrictEqual([newProfile("a", "Default")]);
    expect(profiles.get().profilesToClear).toStrictEqual(["b"]);
    expect(logs).toStrictEqual([
      "The data of removed profile b in persist:b was not deleted, and will be tried again at the next launch: locked",
    ]);
  });

  it("applies changes one at a time, in the order asked", async () => {
    const { profiles, steps } = setup();

    await Promise.all([
      profiles.add(),
      profiles.select("a"),
      profiles.remove("b"),
    ]);

    expect(steps.filter((step) => !step.startsWith("views"))).toStrictEqual([
      "save a,b,new-1 to clear []",
      "save a,b,new-1 to clear []",
      "save a,new-1 to clear [b]",
      "clear persist:b",
      "save a,new-1 to clear []",
    ]);
    expect(profiles.get().selectedProfileId).toBe("a");
  });
});

/** Two profiles, with removals whose data a quit left uncleared. */
const leftOver = (profilesToClear: string[]): State => ({
  ...two,
  profilesToClear,
});

describe("finishing clears at startup", () => {
  it("clears each removed profile on the list and empties it", async () => {
    const { profiles, steps } = setup({ initial: leftOver(["x", "y"]) });

    await profiles.finishClears();

    expect(steps).toStrictEqual([
      "clear persist:x",
      "clear persist:y",
      "save a,b to clear []",
      "views a,b",
    ]);
  });

  it("keeps on the list, and logs, a profile whose clear fails again", async () => {
    const { profiles, logs } = setup({
      initial: leftOver(["x", "y"]),
      failClear: ["persist:y"],
    });

    await profiles.finishClears();

    expect(profiles.get().profilesToClear).toStrictEqual(["y"]);
    expect(logs).toStrictEqual([
      "The data of removed profile y in persist:y was not deleted, and will be tried again at the next launch: locked",
    ]);
  });

  it("never clears an id that is still listed as a profile, and drops it from the list with a log line", async () => {
    const { profiles, steps, logs } = setup({ initial: leftOver(["b", "x"]) });

    await profiles.finishClears();

    expect(steps).not.toContain("clear persist:b");
    expect(steps).toContain("clear persist:x");
    expect(profiles.get().profilesToClear).toStrictEqual([]);
    expect(logs).toStrictEqual([
      "Kept the data of profile b, which was on the list to clear but is still listed",
    ]);
  });

  it("does nothing when nothing is left to clear", async () => {
    const { profiles, steps } = setup();

    await profiles.finishClears();

    expect(steps).toStrictEqual([]);
  });
});

describe("Do Not Disturb in the profiles' state", () => {
  it("saves it switched on and off", async () => {
    const { profiles, saved } = setup();

    await profiles.switchDoNotDisturb(5000);
    await profiles.switchDoNotDisturb(null);
    await profiles.switchDoNotDisturb(undefined);

    expect(saved.map((state) => state.doNotDisturb)).toStrictEqual([
      { until: 5000 },
      { until: null },
      undefined,
    ]);
  });

  it("drops one that has ended with the next write, which is not its own", async () => {
    const { profiles, steps, saved } = setup({
      initial: { ...two, doNotDisturb: { until: 1000 } },
      now: 2000,
    });

    expect(steps).toStrictEqual([]);
    expect(profiles.get().doNotDisturb).toStrictEqual({ until: 1000 });

    await profiles.select("a");

    expect(saved[0]).not.toHaveProperty("doNotDisturb");
    expect(profiles.get()).not.toHaveProperty("doNotDisturb");
  });

  it("keeps one that has not ended through other writes", async () => {
    const { profiles, saved } = setup({
      initial: { ...two, doNotDisturb: { until: 3000 } },
      now: 2000,
    });

    await profiles.select("a");

    expect(saved[0]?.doNotDisturb).toStrictEqual({ until: 3000 });
  });
});
