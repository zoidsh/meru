import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import type { Capability } from "#core/entitlement.ts";
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
  it("adds a profile with a new id, the next name and the first colour no profile has, selected, saved before it shows", async () => {
    const { profiles, steps } = setup();

    await expect(profiles.add()).resolves.toBe("new-1");

    expect(profiles.get().profiles.at(-1)).toStrictEqual({
      ...newProfile("new-1", "Profile 3"),
      color: "green",
    });
    expect(profiles.get().selectedProfileId).toBe("new-1");
    expect(steps).toStrictEqual([
      "save a,b,new-1 to clear []",
      "views a,b,new-1",
    ]);
  });

  it("moves a profile and stores a colour, saved, and writes nothing for an unknown one", async () => {
    const { profiles, steps } = setup();

    const results = [
      await profiles.move("b", 0),
      await profiles.setColor("a", "violet"),
      await profiles.setColor("gone", "violet"),
      await profiles.move("gone", 0),
    ];

    expect(results).toStrictEqual([true, true, false, false]);
    expect(
      profiles.get().profiles.map((profile) => [profile.id, profile.color])
    ).toStrictEqual([
      ["b", "orange"],
      ["a", "violet"],
    ]);
    expect(steps.filter((step) => step.startsWith("save"))).toHaveLength(2);
  });

  it("settles only once every change asked for before has been written", async () => {
    const { profiles, steps } = setup();
    const changes = [profiles.select("a"), profiles.add()];

    await profiles.settled();
    steps.push("settled");
    await Promise.all(changes);

    expect(steps.at(-1)).toBe("settled");
    expect(steps.filter((step) => step.startsWith("save"))).toHaveLength(2);
  });

  it("selects another listed profile, and writes nothing for the selected one or an unknown one", async () => {
    const { profiles, steps } = setup();

    await expect(profiles.select("a")).resolves.toBeTruthy();
    await expect(profiles.select("a")).resolves.toBeFalsy();
    await expect(profiles.select("missing")).resolves.toBeFalsy();

    expect(profiles.get().selectedProfileId).toBe("a");
    expect(steps).toStrictEqual(["save a,b to clear []", "views a,b"]);
  });

  it("saves a profile's inbox as tabbed once, and writes nothing when the page says the same again", async () => {
    const { profiles, saved } = setup();

    await expect(profiles.setTabbedInbox("a", true)).resolves.toBeTruthy();
    await expect(profiles.setTabbedInbox("a", true)).resolves.toBeFalsy();
    await expect(profiles.setTabbedInbox("missing", true)).resolves.toBeFalsy();

    expect(saved).toHaveLength(1);
    expect(saved[0]?.profiles[0]).toMatchObject({ tabbedInbox: true });
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

/** Profiles whose run lacks `refused` until `license`. */
const setupGated = (
  initial: State,
  refused: Capability | readonly Capability[]
) => {
  let granted = false;
  const saved: State[] = [];
  const heard: State[] = [];
  const profiles = createProfiles({
    initial,
    save: (state) => {
      saved.push(state);

      return Promise.resolve();
    },
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: () => 2000,
    log: () => false,
    can: (capability) => granted || ![refused].flat().includes(capability),
  });

  profiles.onChange((state) => heard.push(state));

  return {
    profiles,
    saved,
    heard,
    license: () => {
      granted = true;
      profiles.recheck();
    },
  };
};

describe("Do Not Disturb without Meru Pro", () => {
  it("holds none, switches none, and writes the stored one back as found, ended or not", async () => {
    const { profiles, saved } = setupGated(
      { ...two, doNotDisturb: { until: null, later: "kept" } },
      "notificationGates"
    );
    const ended = setupGated(
      { ...two, doNotDisturb: { until: 1000 } },
      "notificationGates"
    );

    const read = profiles.get();
    const switched = await Promise.allSettled([
      profiles.switchDoNotDisturb(5000),
      profiles.switchDoNotDisturb(undefined),
    ]);

    await profiles.select("a");
    await ended.profiles.select("a");

    expect([
      read.doNotDisturb,
      switched.map((result) => result.status),
      saved.map((state) => state.doNotDisturb),
      ended.saved.map((state) => state.doNotDisturb),
      await ended.profiles.forgetEndedDoNotDisturb(),
    ]).toStrictEqual([
      undefined,
      ["rejected", "rejected"],
      [{ until: null, later: "kept" }],
      [{ until: 1000 }],
      false,
    ]);
  });

  it("brings the stored one back at once with a license, and tells every listener", () => {
    const { profiles, heard, license } = setupGated(
      { ...two, doNotDisturb: { until: null } },
      "notificationGates"
    );

    license();

    expect([profiles.get().doNotDisturb, heard.length]).toStrictEqual([
      { until: null },
      1,
    ]);
  });
});

describe("saved searches without Meru Pro", () => {
  const withSearches: State = {
    ...two,
    profiles: two.profiles.map((profile) => ({
      ...profile,
      savedSearches: [{ id: "s", query: "is:starred" }],
    })),
  };

  it("lists none, changes none, and writes each stored list back as found", async () => {
    const { profiles, saved } = setupGated(withSearches, "savedSearches");

    const read = profiles
      .get()
      .profiles.map((profile) => profile.savedSearches);
    const changed = await Promise.allSettled([
      profiles.addSavedSearch("a", "is:unread"),
      profiles.renameSavedSearch("a", "s", "Starred"),
      profiles.removeSavedSearch("a", "s"),
    ]);

    await profiles.select("a");

    expect([
      read,
      changed.map((result) => result.status),
      saved.map((state) => state.profiles.map((p) => p.savedSearches)),
    ]).toStrictEqual([
      [[], []],
      ["rejected", "rejected", "rejected"],
      [withSearches.profiles.map((profile) => profile.savedSearches)],
    ]);
  });

  it("brings them back at once with a license", () => {
    const { profiles, license } = setupGated(withSearches, "savedSearches");

    license();

    expect(
      profiles.get().profiles.map((profile) => profile.savedSearches)
    ).toStrictEqual(withSearches.profiles.map((p) => p.savedSearches));
  });
});

describe("tabs, splits and bookmarks without Meru Pro", () => {
  const decoded = decodeState({
    version: 1,
    profiles: [
      {
        id: "a",
        name: "Default",
        tabs: [
          {
            id: "gmail",
            app: "gmail",
            url: "https://mail.google.com/",
            title: "",
            pinned: true,
          },
          {
            id: "c",
            app: "calendar",
            url: "https://calendar.google.com/",
            title: "",
            pinned: true,
          },
          {
            id: "d1",
            app: "drive",
            url: "https://drive.google.com/",
            title: "",
          },
          {
            id: "d2",
            app: "drive",
            url: "https://drive.google.com/2",
            title: "",
          },
        ],
        selectedTabId: "d1",
        splits: [
          {
            root: {
              direction: "row",
              children: [
                { size: 0.5, pane: "d1" },
                { size: 0.5, pane: "d2" },
              ],
            },
          },
        ],
        bookmarks: [
          {
            id: "b",
            url: "https://docs.google.com/x",
            title: "Doc",
            app: "docs",
          },
        ],
      },
    ],
    selectedProfileId: "a",
  });

  if (decoded.kind !== "read") {
    throw new Error("The fixture does not decode");
  }

  const stored = decoded.value;
  const refused = ["workspaceApps", "splitView", "bookmarks"] as const;
  const gmailKey = { profileId: "a", tabId: "gmail" };
  const calendar = APPS.find((app) => app.id === "calendar");
  const gmail = APPS.find((app) => app.id === "gmail");

  const page = {
    url: "https://docs.google.com/y",
    title: "Y",
    app: "docs",
  } as const;
  const calendarKey = { profileId: "a", tabId: "c" };

  /** Each change the gate refuses, which the same run with the grants makes. */
  const tryEach = (profiles: ReturnType<typeof setupGated>["profiles"]) => {
    if (!calendar || !gmail) {
      throw new Error("The registry lacks an app");
    }

    return Promise.all([
      profiles
        .openTab("a", calendar, calendar.home, "new")
        .then((opened) => opened !== undefined),
      profiles
        .openTab("a", gmail, gmail.home, "gmail", undefined, "row")
        .then((opened) => opened !== undefined),
      profiles.setPinned(gmailKey, false),
      profiles.toggleBookmark("a", page).then((now) => now !== undefined),
    ]);
  };

  it("opens, unpins, splits and bookmarks nothing on the free version, and writes nothing, where a licensed run makes each change", async () => {
    const free = setupGated(stored, refused);
    const licensed = setupGated(stored, []);

    expect([
      await tryEach(free.profiles),
      free.saved,
      await tryEach(licensed.profiles),
    ]).toStrictEqual([
      [false, false, false, false],
      [],
      [true, true, true, true],
    ]);
  });

  const splitting = async (refusing: readonly Capability[]) => {
    const { profiles, saved } = setupGated(stored, refusing);

    return [
      profiles.get().profiles[0]?.tabs.length,
      await profiles.splitTab(calendarKey, "row"),
      await profiles.splitOntoTab(calendarKey, "gmail"),
      saved.length,
    ];
  };

  it("splits no tab without splitView, by the menu or a drop onto another, while every tab shows", async () => {
    expect([await splitting(["splitView"]), await splitting([])]).toStrictEqual(
      [
        [4, false, false, 0],
        [4, true, true, 2],
      ]
    );
  });

  it("still opens a link in the Gmail tab, writing every hidden tab, the split and the bookmark back as stored", async () => {
    const { profiles, saved } = setupGated(stored, refused);

    if (!gmail) {
      throw new Error("The registry lacks Gmail");
    }

    const opened = await profiles.openTab(
      "a",
      gmail,
      "https://mail.google.com/#starred",
      "gmail"
    );
    const [written] = saved;

    expect([
      opened?.tabId,
      profiles.get().profiles[0]?.tabs.length,
      written?.profiles[0]?.tabs.length,
      written?.profiles[0]?.selectedTabId,
      written?.profiles[0]?.splits,
      written?.profiles[0]?.bookmarks,
    ]).toStrictEqual([
      "gmail",
      1,
      4,
      "d1",
      stored.profiles[0]?.splits,
      stored.profiles[0]?.bookmarks,
    ]);
  });

  it("brings the tabs, the split and the bookmark back at once with a license", () => {
    const { profiles, heard, license } = setupGated(stored, refused);

    license();

    expect([profiles.get().profiles[0], heard.length]).toStrictEqual([
      stored.profiles[0],
      1,
    ]);
  });
});

/** Profiles that may use the first profile alone until `license`. */
const setupFree = (initial: State = two) => {
  let multiple = false;
  const saved: State[] = [];
  const cleared: string[] = [];
  const heard: State[] = [];
  const profiles = createProfiles({
    initial,
    save: (state) => {
      saved.push(state);

      return Promise.resolve();
    },
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: (partition) => {
      cleared.push(partition);

      return Promise.resolve();
    },
    now: () => 0,
    log: () => false,
    multipleProfiles: () => multiple,
  });

  profiles.onChange((state) => heard.push(state));

  return {
    profiles,
    saved,
    cleared,
    heard,
    license: () => {
      multiple = true;
      profiles.recheck();
    },
  };
};

describe("one profile alone, on the free version", () => {
  it("shows the first profile alone, selected, whichever is stored selected, and lists the other as locked", () => {
    const { profiles } = setupFree();

    expect(profiles.get().profiles.map(({ id }) => id)).toStrictEqual(["a"]);
    expect(profiles.get().selectedProfileId).toBe("a");
    expect(profiles.locked().map(({ id }) => id)).toStrictEqual(["b"]);
  });

  it("writes every change with the other profile and the stored selection as found", async () => {
    const { profiles, saved } = setupFree();
    const calendar = APPS.find((app) => app.id === "calendar");

    if (!calendar) {
      throw new Error("No Calendar app");
    }

    const bounds = { x: 0, y: 0, width: 800, height: 600 };

    await profiles.rename("a", "Mine");
    await profiles.openTab("a", calendar, calendar.home, "tab");
    await profiles.setOwnWindowBounds({ profileId: "a", tabId: "tab" }, bounds);
    await profiles.setTabbedInbox("a", true);
    await profiles.switchDoNotDisturb(null);
    await profiles.change((state) => ({ ...state, downloads: [] }));

    const [first, second] = two.profiles;

    expect(
      saved.map(({ selectedProfileId }) => selectedProfileId)
    ).toStrictEqual(["b", "b", "b", "b", "b", "b"]);
    expect(saved.at(-1)).toStrictEqual({
      ...two,
      profiles: [
        {
          ...first,
          name: "Mine",
          tabs: [
            ...(first?.tabs ?? []),
            {
              id: "tab",
              app: "calendar",
              url: calendar.home,
              title: "",
              windowBounds: bounds,
            },
          ],
          selectedTabId: "tab",
          tabbedInbox: true,
        },
        second,
      ],
      selectedProfileId: "b",
      doNotDisturb: { until: null },
      downloads: [],
    });
    expect(profiles.get().profiles).toHaveLength(1);
  });

  it("adds no profile and writes nothing", async () => {
    const { profiles, saved } = setupFree();

    await expect(profiles.add()).resolves.toBeUndefined();
    expect(saved).toStrictEqual([]);
  });

  it("brings the other profile back, selected as stored, once a license allows it, writing nothing", () => {
    const { profiles, saved, heard, license } = setupFree();

    license();

    expect(heard.map((state) => state.selectedProfileId)).toStrictEqual(["b"]);
    expect(profiles.get().profiles.map(({ id }) => id)).toStrictEqual([
      "a",
      "b",
    ]);
    expect(profiles.locked()).toStrictEqual([]);
    expect(saved).toStrictEqual([]);
  });

  it("never clears a profile it does not use that the list to clear still names, and clears one removed", async () => {
    const { profiles, cleared, saved } = setupFree({
      ...two,
      profilesToClear: ["b", "c"],
    });

    await profiles.finishClears();

    expect(cleared).toStrictEqual(["persist:c"]);
    expect(saved.at(-1)?.profilesToClear).toStrictEqual([]);
    expect(saved.at(-1)?.profiles.map(({ id }) => id)).toStrictEqual([
      "a",
      "b",
    ]);
  });
});
