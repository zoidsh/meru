import { describe, expect, it } from "vitest";

import type { SoundRequest } from "#contract/shell-sound.ts";
import type { Settings } from "#core/settings.ts";
import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createDoNotDisturb } from "./do-not-disturb.ts";
import { createProfiles } from "./profiles.ts";
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
  const deps = {
    settings,
    profiles,
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
    dispose: doNotDisturb.dispose,
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

describe(readSettingsState, () => {
  it("sends a lone profile no own value of a key off the page or one that does not parse", () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      profiles: { work: { trayIcon: "dark", notifications: "maybe" } },
    });

    expect(app.read().profiles).toStrictEqual([
      { id: "work", name: "Work", color: "#2d52d2", overrides: {} },
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
      { id: "home", name: "Home", color: "#2d52d2", overrides: {} },
      {
        id: "work",
        name: "Work",
        color: "#ff6227",
        overrides: { notificationSound: "chime" },
      },
    ]);
    app.dispose();
  });
});
