import { describe, expect, it } from "vitest";

import type { State } from "#core/state.ts";

import { createProfiles } from "./profiles.ts";

const two: State = {
  version: 1,
  profiles: [
    { id: "a", name: "Default" },
    { id: "b", name: "Profile 2" },
  ],
  selectedProfileId: "b",
};

/**
 * Profiles over fakes that record each step in one log, in order, and fail
 * at the step named.
 */
const setup = ({ fail }: { fail?: "save" | "close-view" | "clear" } = {}) => {
  const steps: string[] = [];
  const logs: string[] = [];
  const saved: State[] = [];
  let ids = 0;

  const profiles = createProfiles({
    initial: two,
    save: (state) => {
      steps.push(
        `save ${state.profiles.map((profile) => profile.id).join(",")}`
      );

      if (fail === "save") {
        return Promise.reject(new Error("disk full"));
      }

      saved.push(state);

      return Promise.resolve();
    },
    newId: () => {
      ids += 1;

      return `new-${ids}`;
    },
    profileName: (n) => `Profile ${n}`,
    clearSession: (partition) => {
      steps.push(`clear ${partition}`);

      return fail === "clear"
        ? Promise.reject(new Error("locked"))
        : Promise.resolve();
    },
    log: (message) => logs.push(message),
  });

  // Stands in for the view manager, which closes a removed profile's view.
  profiles.onChange((state) => {
    steps.push(
      `views ${state.profiles.map((profile) => profile.id).join(",")}`
    );

    if (fail === "close-view") {
      throw new Error("view gone wrong");
    }
  });

  return { profiles, steps, logs, saved };
};

describe(createProfiles, () => {
  it("adds a profile with a new id and the next name, selected, saved before it shows", async () => {
    const { profiles, steps } = setup();

    await expect(profiles.add()).resolves.toBeTruthy();

    expect(profiles.get().profiles.at(-1)).toStrictEqual({
      id: "new-1",
      name: "Profile 3",
    });
    expect(profiles.get().selectedProfileId).toBe("new-1");
    expect(steps).toStrictEqual(["save a,b,new-1", "views a,b,new-1"]);
  });

  it("selects a listed profile and ignores another", async () => {
    const { profiles, steps } = setup();

    await expect(profiles.select("a")).resolves.toBeTruthy();
    await expect(profiles.select("missing")).resolves.toBeFalsy();

    expect(profiles.get().selectedProfileId).toBe("a");
    expect(steps).toStrictEqual(["save a,b", "views a,b"]);
  });

  it("removes a profile by saving the list without it, closing its view, then clearing its data", async () => {
    const { profiles, steps, logs } = setup();

    await expect(profiles.remove("b")).resolves.toBeTruthy();

    expect(profiles.get()).toStrictEqual({
      ...two,
      profiles: [{ id: "a", name: "Default" }],
      selectedProfileId: "a",
    });
    expect(steps).toStrictEqual(["save a", "views a", "clear persist:b"]);
    expect(logs).toStrictEqual([]);
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
    const { profiles, steps } = setup({ fail: "save" });

    await expect(profiles.remove("b")).rejects.toThrow("disk full");

    expect(profiles.get()).toStrictEqual(two);
    expect(steps).toStrictEqual(["save a"]);
  });

  it("still clears the data, and logs, when closing the view fails", async () => {
    const { profiles, steps, logs } = setup({ fail: "close-view" });

    await expect(profiles.remove("b")).resolves.toBeTruthy();

    expect(profiles.get().profiles).toStrictEqual([
      { id: "a", name: "Default" },
    ]);
    expect(steps).toStrictEqual(["save a", "views a", "clear persist:b"]);
    expect(logs).toStrictEqual(["A profiles listener failed: view gone wrong"]);
  });

  it("logs where the data was left when clearing it fails, with the profile already unlisted", async () => {
    const { profiles, saved, logs } = setup({ fail: "clear" });

    await expect(profiles.remove("b")).resolves.toBeTruthy();

    expect(saved.at(-1)?.profiles).toStrictEqual([
      { id: "a", name: "Default" },
    ]);
    expect(logs).toStrictEqual([
      "Removed profile b, but its data in persist:b was not deleted: locked",
    ]);
  });

  it("applies changes one at a time, in the order asked", async () => {
    const { profiles, steps } = setup();

    await Promise.all([
      profiles.add(),
      profiles.select("a"),
      profiles.remove("b"),
    ]);

    expect(steps).toStrictEqual([
      "save a,b,new-1",
      "views a,b,new-1",
      "save a,b,new-1",
      "views a,b,new-1",
      "save a,new-1",
      "views a,new-1",
      "clear persist:b",
    ]);
    expect(profiles.get().selectedProfileId).toBe("a");
  });
});
