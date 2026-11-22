import { describe, expect, it } from "vitest";

import type { SoundRequest } from "#contract/shell-sound.ts";
import type { FeedOutcome } from "#core/feed.ts";
import type { Settings } from "#core/settings.ts";
import { checksMail, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createDoNotDisturb } from "./do-not-disturb.ts";
import { createMailPoller } from "./mail.ts";
import { createProfiles } from "./profiles.ts";
import { createRemoveProfile } from "./remove-profile.ts";
import { readSettingsState, settingsHandlers } from "./settings-contract.ts";
import { createSettingsPages } from "./settings-pages.ts";
import { createSettingsStore } from "./settings.ts";

const stateOf = (...names: string[]): State => ({
  version: 1,
  profiles: names.map((name) => newProfile(name.toLowerCase(), name)),
  selectedProfileId: names[0]?.toLowerCase() ?? "",
});

const setup = (state: State, initial?: Settings) => {
  const saved: unknown[] = [];
  const announced: string[] = [];
  const settings = createSettingsStore({
    initial: initial ?? { version: 1 },
    save: (next) => {
      saved.push(structuredClone(next));

      return Promise.resolve();
    },
    platform: "darwin",
    log: () => false,
  });
  const profiles = createProfiles({
    initial: state,
    save: () => Promise.resolve(),
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: Date.now,
    log: () => false,
  });
  const doNotDisturb = createDoNotDisturb({
    profiles,
    now: () => new Date(),
    log: () => false,
  });
  const played: SoundRequest[] = [];
  const tested: (string | undefined)[] = [];
  const pages = createSettingsPages();
  // Each profile's feed answers at once with what the test puts here.
  const feeds = new Map<string, FeedOutcome>();
  const mail = createMailPoller({
    fetchFeed: (profileId) =>
      Promise.resolve(
        feeds.get(profileId) ?? { kind: "failed", reason: "no feed" }
      ),
    // No profile's inbox has a label here.
    inboxLabel: (profileId) => new Map<string, string>().get(profileId),
    isOnline: () => true,
    log: () => false,
  });
  const asked: string[] = [];
  // What the composition root's add does beside adding, as closing the inbox.
  const addedBy: string[] = [];
  let confirms = true;
  const deps = {
    settings,
    profiles,
    mail,
    addProfile: async () => {
      const profileId = await profiles.add();

      addedBy.push("addProfile");

      return profileId;
    },
    doNotDisturb,
    sound: {
      play: (request: SoundRequest) => {
        played.push(request);
      },
    },
    pages,
    showTestNotification: (profileId: string | undefined) => {
      tested.push(profileId);
    },
    removeProfile: createRemoveProfile({
      profiles,
      window: {
        confirm: ({ message }) => {
          asked.push(message);

          return Promise.resolve(confirms);
        },
      },
      log: () => false,
    }),
  };

  settings.onChange("notificationSender", () =>
    announced.push("notificationSender")
  );

  return {
    handlers: settingsHandlers(deps),
    read: () => readSettingsState(deps),
    saved,
    announced,
    played,
    tested,
    asked,
    addedBy,
    confirming: (next: boolean) => {
      confirms = next;
    },
    profiles,
    /** Polls the listed profiles' feeds, which answer with these, and lets each answer land. */
    poll: async (answers: Record<string, FeedOutcome>) => {
      for (const [profileId, outcome] of Object.entries(answers)) {
        feeds.set(profileId, outcome);
      }

      mail.reconcile(
        profiles.get().profiles.map((profile) => profile.id),
        profiles
          .get()
          .profiles.filter((profile) => !checksMail(profile))
          .map((profile) => profile.id)
      );
      await Promise.resolve();
      await Promise.resolve();
    },
    dispose: () => {
      doNotDisturb.dispose();
      mail.reconcile([], []);
    },
  };
};

describe(settingsHandlers, () => {
  it("shows a test notification for the app or a listed profile, never an unlisted one", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.showTestNotification({ profileId: null });
    await app.handlers.showTestNotification({ profileId: "work" });

    await expect(
      app.handlers.showTestNotification({ profileId: "gone" })
    ).rejects.toThrow("No listed profile has the id gone");
    expect(app.tested).toStrictEqual([undefined, "work"]);
    app.dispose();
  });

  it("refuses a test notification while Do Not Disturb holds", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.setDoNotDisturb({ on: true });

    await expect(
      app.handlers.showTestNotification({ profileId: null })
    ).rejects.toThrow("Do Not Disturb holds every notification");
    expect(app.tested).toStrictEqual([]);
    app.dispose();
  });

  it("previews a sound at the app's volume, even while Do Not Disturb holds", async () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      notificationSoundVolume: 0.4,
      profiles: { work: { notificationSound: "duet" } },
    });

    await app.handlers.setDoNotDisturb({ on: true });
    await app.handlers.previewSound({ sound: "knock" });

    expect(app.played).toStrictEqual([{ sound: "knock", volume: 0.4 }]);
    app.dispose();
  });

  it("sets and clears a listed profile's own value, leaving the app value", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.setOverride({
      profileId: "work",
      key: "notificationSender",
      value: false,
    });

    const set = app.saved.at(-1);

    await app.handlers.clearOverride({
      profileId: "work",
      key: "notificationSender",
    });

    expect([set, app.saved.at(-1)]).toStrictEqual([
      { version: 1, profiles: { work: { notificationSender: false } } },
      { version: 1 },
    ]);
    app.dispose();
  });

  it("refuses a profile that is not listed, writing nothing", async () => {
    const app = setup(stateOf("Home", "Work"));

    await expect(
      app.handlers.setOverride({
        profileId: "gone",
        key: "notificationSender",
        value: false,
      })
    ).rejects.toThrow("No listed profile has the id gone");
    await expect(
      app.handlers.clearOverride({ profileId: "gone", key: "unreadBadge" })
    ).rejects.toThrow("No listed profile has the id gone");
    expect(app.saved).toStrictEqual([]);
    app.dispose();
  });

  it("with two profiles sets the app value alone", async () => {
    const app = setup(stateOf("Home", "Work"), {
      version: 1,
      profiles: { work: { notificationSender: false } },
    });

    await app.handlers.update({ key: "notificationSender", value: false });

    expect(app.saved).toStrictEqual([
      {
        version: 1,
        notificationSender: false,
        profiles: { work: { notificationSender: false } },
      },
    ]);
    app.dispose();
  });

  it("with one profile sets the app value alone, leaving the profile's own", async () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      profiles: { work: { notificationSender: false } },
    });

    await app.handlers.update({ key: "notificationSender", value: true });

    expect([app.saved, app.announced]).toStrictEqual([
      [
        {
          version: 1,
          notificationSender: true,
          profiles: { work: { notificationSender: false } },
        },
      ],
      [],
    ]);
    app.dispose();
  });
});

describe("the Settings window's pages", () => {
  it("opens a listed profile's page inside Profiles, and steps back and forward", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.openPage({ section: "profiles", profileId: null });
    await app.handlers.openPage({ section: "profiles", profileId: "work" });
    await app.handlers.goBack({});

    const back = app.read().page;

    await app.handlers.goForward({});

    expect([back, app.read().page]).toStrictEqual([
      {
        section: "profiles",
        profileId: null,
        canGoBack: true,
        canGoForward: true,
      },
      {
        section: "profiles",
        profileId: "work",
        canGoBack: true,
        canGoForward: false,
      },
    ]);
    app.dispose();
  });

  it("refuses the page of an unlisted profile, or a profile's page outside Profiles", async () => {
    const app = setup(stateOf("Home", "Work"));

    await expect(
      app.handlers.openPage({ section: "profiles", profileId: "gone" })
    ).rejects.toThrow("No listed profile has the id gone");
    await expect(
      app.handlers.openPage({ section: "notifications", profileId: "work" })
    ).rejects.toThrow("Only Profiles holds a profile's page");
    expect(app.read().page).toStrictEqual({
      section: "notifications",
      profileId: null,
      canGoBack: false,
      canGoForward: false,
    });
    app.dispose();
  });
});

describe("the Settings window's profile calls", () => {
  it("adds a profile through the app's one add, selected, with the first colour unused, and shows its page", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.openPage({ section: "profiles", profileId: null });

    const profileId = await app.handlers.addProfile({});

    expect([
      profileId,
      app.addedBy,
      app.profiles.get().selectedProfileId,
      app.read().profiles.at(-1),
      app.read().page,
    ]).toStrictEqual([
      "new",
      ["addProfile"],
      "new",
      {
        id: "new",
        name: "Profile 2",
        color: "oklch(0.72 0.19 150)",
        colorName: "green",
        asleep: false,
        checkMail: true,
        mail: { status: "unknown", address: null },
        savedSearches: [],
        overrides: {},
      },
      {
        section: "profiles",
        profileId: "new",
        canGoBack: true,
        canGoForward: false,
      },
    ]);
    app.dispose();
  });

  it("renames, recolours and moves a listed profile", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.renameProfile({ profileId: "work", name: "  Job " });
    await app.handlers.renameProfile({ profileId: "work", name: "   " });
    await app.handlers.setProfileColor({ profileId: "work", color: "violet" });
    await app.handlers.moveProfile({ profileId: "work", toIndex: 0 });

    expect(
      app
        .read()
        .profiles.map(({ id, name, colorName }) => [id, name, colorName])
    ).toStrictEqual([
      ["work", "Job", "violet"],
      ["home", "Home", "blue"],
    ]);
    app.dispose();
  });

  it("refuses an unlisted profile and a place past the last, changing nothing", async () => {
    const app = setup(stateOf("Home", "Work"));
    const before = app.read().profiles;

    const refusals = await Promise.all(
      [
        app.handlers.renameProfile({ profileId: "gone", name: "Job" }),
        app.handlers.setProfileColor({ profileId: "gone", color: "lime" }),
        app.handlers.moveProfile({ profileId: "gone", toIndex: 0 }),
        app.handlers.moveProfile({ profileId: "home", toIndex: 2 }),
        app.handlers.removeProfile({ profileId: "gone" }),
      ].map((call) =>
        call
          .then(() => "done")
          .catch((error: unknown) =>
            error instanceof Error ? error.message : error
          )
      )
    );

    expect(refusals).toStrictEqual([
      "No listed profile has the id gone",
      "No listed profile has the id gone",
      "No listed profile has the id gone",
      "No place 2 among 2 profiles",
      "No listed profile has the id gone",
    ]);
    expect([app.read().profiles, app.asked]).toStrictEqual([before, []]);
    app.dispose();
  });

  it("removes a profile once confirmed, its page leaving the history, and keeps it when not", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.openPage({ section: "profiles", profileId: null });
    await app.handlers.openPage({ section: "profiles", profileId: "work" });
    app.confirming(false);
    await app.handlers.removeProfile({ profileId: "work" });

    const kept = app.read().profiles.length;

    app.confirming(true);
    await app.handlers.removeProfile({ profileId: "work" });

    expect([
      kept,
      app.read().profiles.map(({ id }) => id),
      app.asked,
    ]).toStrictEqual([2, ["home"], ["Remove Work?", "Remove Work?"]]);
    app.dispose();
  });

  it("refuses to remove the last profile, asking nothing", async () => {
    const app = setup(stateOf("Home"));

    await expect(
      app.handlers.removeProfile({ profileId: "home" })
    ).rejects.toThrow("The last profile cannot be removed");
    expect(app.asked).toStrictEqual([]);
    app.dispose();
  });
});

describe(readSettingsState, () => {
  it("sends a lone profile no own value of a key off the page or one that does not parse", () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      profiles: { work: { trayIcon: "dark", notifications: "maybe" } },
    });

    expect(app.read().profiles).toStrictEqual([
      {
        id: "work",
        name: "Work",
        color: "#2d52d2",
        colorName: "blue",
        asleep: false,
        checkMail: true,
        mail: { status: "unknown", address: null },
        savedSearches: [],
        overrides: {},
      },
    ]);
    app.dispose();
  });

  it("lists the profiles in order with their name, colour and the values of their own that parse, never an unlisted id's", () => {
    const app = setup(stateOf("Home", "Work"), {
      version: 1,
      profiles: {
        work: { notificationSound: "chime", notifications: "maybe" },
        gone: { notifications: false },
      },
    });

    expect(app.read().profiles).toStrictEqual([
      {
        id: "home",
        name: "Home",
        color: "#2d52d2",
        colorName: "blue",
        asleep: false,
        checkMail: true,
        mail: { status: "unknown", address: null },
        savedSearches: [],
        overrides: {},
      },
      {
        id: "work",
        name: "Work",
        color: "#ff6227",
        colorName: "orange",
        asleep: false,
        checkMail: true,
        mail: { status: "unknown", address: null },
        savedSearches: [],
        overrides: { notificationSound: "chime" },
      },
    ]);
    app.dispose();
  });

  it("tells each profile's sleep, Check mail, mail status and the address its feed gave", async () => {
    const state = stateOf("Home", "Work", "Club");
    const app = setup({
      ...state,
      profiles: state.profiles.map((profile) => {
        if (profile.id === "work") {
          return { ...profile, asleep: true };
        }

        return profile.id === "club"
          ? { ...profile, checkMail: false }
          : profile;
      }),
    });

    await app.poll({
      home: {
        kind: "feed",
        feed: { unreadCount: 0, entries: [], address: "me@example.org" },
      },
      work: { kind: "signedOut" },
    });

    expect(
      app
        .read()
        .profiles.map(({ id, asleep, checkMail, mail }) => [
          id,
          asleep,
          checkMail,
          mail,
        ])
    ).toStrictEqual([
      ["home", false, true, { status: "ok", address: "me@example.org" }],
      ["work", true, true, { status: "signedOut", address: null }],
      ["club", false, false, { status: "notChecked", address: null }],
    ]);
    app.dispose();
  });
});

describe("the Settings window's Check mail and Sleep", () => {
  it("turns a listed profile's Check mail off and on, and refuses an unlisted one", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.setCheckMail({ profileId: "work", on: false });

    const off = app.profiles.get().profiles[1]?.checkMail;

    await app.handlers.setCheckMail({ profileId: "work", on: true });

    expect([
      off,
      Object.hasOwn(app.profiles.get().profiles[1] ?? {}, "checkMail"),
      await app.handlers
        .setCheckMail({ profileId: "gone", on: false })
        .catch((error: unknown) => (error as Error).message),
    ]).toStrictEqual([false, false, "No listed profile has the id gone"]);
    app.dispose();
  });

  it("does nothing when asked for the state a profile is already in", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.setAsleep({ profileId: "work", asleep: true });
    await app.handlers.setAsleep({ profileId: "work", asleep: true });
    await app.handlers.setAsleep({ profileId: "home", asleep: false });

    expect([
      app.read().profiles.map((profile) => profile.asleep),
      app.profiles.get().selectedProfileId,
    ]).toStrictEqual([[false, true], "home"]);
    app.dispose();
  });

  it("puts a profile to sleep, refuses the last awake one, and wakes one by selecting it", async () => {
    const app = setup(stateOf("Home", "Work"));
    const asleep = () => app.read().profiles.map((profile) => profile.asleep);

    await app.handlers.setAsleep({ profileId: "work", asleep: true });

    const workAsleep = asleep();
    const refused = await app.handlers
      .setAsleep({ profileId: "home", asleep: true })
      .catch((error: unknown) => (error as Error).message);

    await app.handlers.setAsleep({ profileId: "work", asleep: false });

    expect([
      workAsleep,
      refused,
      asleep(),
      app.profiles.get().selectedProfileId,
    ]).toStrictEqual([
      [false, true],
      "The last awake profile cannot sleep",
      [false, false],
      "work",
    ]);
    app.dispose();
  });
});

const searched = (...searches: Record<string, string>[]): State => {
  const state = stateOf("Home", "Work");

  return {
    ...state,
    profiles: state.profiles.map((profile) =>
      profile.id === "home" ? { ...profile, savedSearches: searches } : profile
    ),
  };
};
const refusal = async (promise: Promise<unknown>) => {
  try {
    await promise;

    return "done";
  } catch (error) {
    return (error as Error).message;
  }
};

describe("the Settings window's saved searches", () => {
  it("adds a search named or not, and sends each with its name or null", async () => {
    const app = setup(searched({ id: "a", query: "is:starred" }));

    const answer = await app.handlers.addSavedSearch({
      profileId: "home",
      query: " has:attachment ",
      name: " Files ",
    });

    expect([
      answer,
      app.read().profiles.map((profile) => profile.savedSearches),
    ]).toStrictEqual([
      null,
      [
        [
          { id: "a", query: "is:starred", name: null },
          { id: "new", query: "has:attachment", name: "Files" },
        ],
        [],
      ],
    ]);
    app.dispose();
  });

  it("answers why it refuses an empty or repeated query, and throws for an unlisted profile", async () => {
    const app = setup(searched({ id: "a", query: "is:starred" }));

    expect([
      await app.handlers.addSavedSearch({
        profileId: "home",
        query: "  ",
        name: "",
      }),
      await app.handlers.addSavedSearch({
        profileId: "home",
        query: "is:starred ",
        name: "Again",
      }),
      await refusal(
        app.handlers.addSavedSearch({ profileId: "gone", query: "x", name: "" })
      ),
      app.read().profiles[0]?.savedSearches.length,
    ]).toStrictEqual([
      "empty",
      "duplicate",
      "No listed profile has the id gone",
      1,
    ]);
    app.dispose();
  });

  it("renames, clears a name and removes a search, refusing an unknown search or profile", async () => {
    const app = setup(
      searched(
        { id: "a", query: "is:starred" },
        { id: "b", query: "is:unread", label: "Unread" }
      )
    );

    await app.handlers.renameSavedSearch({
      profileId: "home",
      searchId: "a",
      name: "Starred",
    });
    await app.handlers.renameSavedSearch({
      profileId: "home",
      searchId: "b",
      name: "",
    });

    const renamed = app.read().profiles[0]?.savedSearches;

    await app.handlers.removeSavedSearch({ profileId: "home", searchId: "a" });

    expect([
      renamed,
      app.read().profiles[0]?.savedSearches,
      await refusal(
        app.handlers.renameSavedSearch({
          profileId: "work",
          searchId: "b",
          name: "N",
        })
      ),
      await refusal(
        app.handlers.removeSavedSearch({ profileId: "gone", searchId: "b" })
      ),
    ]).toStrictEqual([
      [
        { id: "a", query: "is:starred", name: "Starred" },
        { id: "b", query: "is:unread", name: null },
      ],
      [{ id: "b", query: "is:unread", name: null }],
      "No saved search of work has the id b",
      "No listed profile has the id gone",
    ]);
    app.dispose();
  });
});
