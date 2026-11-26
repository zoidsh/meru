import { describe, expect, it } from "vitest";

import {
  ADVANCED_PAGE_KEYS,
  APPEARANCE_PAGE_KEYS,
  GENERAL_PAGE_KEYS,
  GMAIL_PAGE_KEYS,
  SETTINGS_CALLS,
  MENU_BAR_PAGE_KEYS,
  PRIVACY_PAGE_KEYS,
  TABS_APPS_PAGE_KEYS,
} from "#contract/settings.ts";
import type { SoundRequest } from "#contract/shell-sound.ts";
import type { BrowsingDataKinds } from "#core/browsing-data.ts";
import { withToken } from "#core/entitlement-file.ts";
import { DAY, MERU_PRO_URL } from "#core/entitlement.ts";
import type { FeedOutcome } from "#core/feed.ts";
import type { Platform } from "#core/platform.ts";
import type { Settings } from "#core/settings.ts";
import { mailPolls, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import { fakeSystemInfo } from "#platform/system-info.fake.ts";
import { fakeTextFile } from "#platform/text-file.fake.ts";
import { fakeUpdater } from "#platform/updater.fake.ts";

import { createAboutPage } from "./about-page.ts";
import { createAdvancedPage } from "./advanced-page.ts";
import { COMMANDS } from "./commands.ts";
import { createDoNotDisturb } from "./do-not-disturb.ts";
import {
  DEV_PUBLIC_KEY,
  createStubEntitlementServer,
  signDevToken,
} from "./entitlement-stub.ts";
import { publicKeyFromRaw } from "./entitlement-token.ts";
import { createEntitlement, entitlementErrorMessage } from "./entitlement.ts";
import { createGeneralPage } from "./general-page.ts";
import { createLanguage } from "./language.ts";
import { createLicenseRequests } from "./license-requests.ts";
import { createMailPoller } from "./mail.ts";
import { createProfiles } from "./profiles.ts";
import { createRemoveProfile } from "./remove-profile.ts";
import {
  onSettingsStateChange,
  readSettingsState,
  settingsHandlers,
} from "./settings-contract.ts";
import { createSettingsPages } from "./settings-pages.ts";
import { createSettingsStore } from "./settings.ts";
import { readShortcuts } from "./shortcuts-page.ts";
import { createSpellcheck } from "./spellcheck.ts";
import { holdEntitlementServer } from "./test-hooks.ts";
import { createTrustedSites } from "./trusted-sites.ts";
import { createUpdates } from "./updates.ts";

const stateOf = (...names: string[]): State => ({
  version: 1,
  profiles: names.map((name) => newProfile(name.toLowerCase(), name)),
  selectedProfileId: names[0]?.toLowerCase() ?? "",
});

/** A trial of this device's, from now, as a first launch is given one. */
const trialFile = () => {
  const now = Date.now();
  const ends = now + 14 * DAY;

  return withToken(
    { version: 1 },
    signDevToken({
      v: 1,
      tier: "trial",
      deviceId: "device",
      issuedAt: now,
      expiresAt: ends,
      trialEndsAt: ends,
    }),
    { tier: "trial" }
  );
};

const setup = (
  state: State,
  initial?: Settings,
  platform: Platform = "darwin",
  languages: readonly [string, ...string[]] = ["en"],
  /** Whether it runs as the free version, with no trial or license, else in a trial. */
  free = false
) => {
  const saved: unknown[] = [];
  const announced: string[] = [];
  // The development stand-in answers; while held, no call is answered
  // until the test lets them through.
  const { server, hold, release } = holdEntitlementServer(
    createStubEntitlementServer({
      file: fakeTextFile("/entitlement-stub.json", new Map()),
      now: Date.now,
      offline: () => false,
    })
  );
  const copied: string[] = [];
  const opened: string[] = [];
  const clipboard = {
    writeText: (text: string) => {
      copied.push(text);

      return Promise.resolve();
    },
  };
  const entitlement = createEntitlement({
    initial: free ? { version: 1 } : trialFile(),
    save: () => Promise.resolve(),
    server,
    publicKey: publicKeyFromRaw(DEV_PUBLIC_KEY),
    deviceId: "device",
    clipboard,
    now: Date.now,
    log: () => false,
  });
  const multipleProfiles = () => entitlement.can("profiles");
  const settings = createSettingsStore({
    initial: initial ?? { version: 1 },
    save: (next) => {
      saved.push(structuredClone(next));

      return Promise.resolve();
    },
    platform: "darwin",
    log: () => false,
    profileValues: multipleProfiles,
    can: entitlement.can,
  });
  const profiles = createProfiles({
    initial: state,
    save: () => Promise.resolve(),
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    now: Date.now,
    log: () => false,
    multipleProfiles,
    can: entitlement.can,
  });

  // As the composition root does, before any window hears of the change.
  entitlement.onChange(() => {
    settings.recheck();
    profiles.recheck();
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
  const deleted: [string, BrowsingDataKinds][] = [];
  const signedIn: string[] = [];
  // The system's login item as a build that only pretends holds it.
  const loginCalls: boolean[] = [];
  let loginOn = false;
  // The folders there to be chosen, and what the picker answers.
  const folders = new Set<string>(["/Users/example/Mail"]);
  let pickerAnswer: string | undefined;
  const pickedAt: string[] = [];
  const activated: string[] = [];
  const language = createLanguage({
    settings,
    available: languages,
    preferredLanguages: () => ["en-US"],
    activate: (tag) => {
      activated.push(tag);
    },
  });
  // A Linux session's checker, holding what each partition was given.
  const checked = new Map<string, readonly string[]>();
  const spellcheck =
    platform === "darwin"
      ? undefined
      : createSpellcheck({
          checker: {
            systemLanguage: () => "en-US",
            available: () => ["de", "en-US", "fr"],
            defaults: () => ["en-US"],
            set: (partition, next) => {
              checked.set(partition, next);
            },
          },
          settings,
          log: () => false,
        });
  const general = createGeneralPage({
    platform,
    loginItem: {
      real: false,
      isOn: () => loginOn,
      set: (on) => {
        loginCalls.push(on);
        loginOn = on;
      },
    },
    settings,
    files: {
      systemFolder: () => "/Users/example/Downloads",
      usable: (folder) => folders.has(folder),
    },
    home: "/Users/example",
    pickFolder: (defaultPath) => {
      pickedAt.push(defaultPath);

      return Promise.resolve(pickerAnswer);
    },
    language,
    spellcheck,
  });
  const deleteBrowsingData = (profileId: string, kinds: BrowsingDataKinds) => {
    deleted.push([profileId, kinds]);

    return Promise.resolve();
  };
  const openedFiles: string[] = [];
  const system = fakeSystemInfo({
    appVersion: "4.0.0-dev.0",
    osRelease: 'PRETTY_NAME="Ubuntu 24.04.3 LTS"\n',
  });
  const updater = fakeUpdater();
  const updates = createUpdates({
    updater: updater.updater,
    settings,
    runningVersion: "4.1.0",
    quitThen: (finish) => {
      finish();
    },
    quit: () => false,
    openExternal: (url) => {
      opened.push(url);
    },
    home: "",
    now: () => 1000,
    log: () => false,
  });
  const deps = {
    updates,
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
    deleteBrowsingData,
    signIn: (profileId: string) => {
      signedIn.push(profileId);

      return Promise.resolve();
    },
    general,
    language,
    trustedSites: createTrustedSites(settings),
    advanced: createAdvancedPage({
      hardwareAccelerationAtLaunch: false,
      settingsFile: fakeTextFile(
        "/settings.json",
        new Map([["/settings.json", "{}"]])
      ),
      settings,
      opener: {
        open: (file) => {
          openedFiles.push(file);

          return Promise.resolve();
        },
      },
      profiles,
      deleteBrowsingData,
      log: () => false,
    }),
    about: createAboutPage({ platform, system: system.system, clipboard }),
    shortcuts: () => readShortcuts(platform, "Meru", COMMANDS),
    entitlement,
    licenseRequests: createLicenseRequests(),
    systemBrowser: {
      open: (url: string) => {
        opened.push(url);

        return Promise.resolve();
      },
    },
  };

  settings.onChange("notificationSender", () =>
    announced.push("notificationSender")
  );

  return {
    deps,
    handlers: settingsHandlers(deps),
    read: () => readSettingsState(deps),
    /** How many times the Settings window would be sent its state again. */
    sends: () => {
      let count = 0;

      onSettingsStateChange(deps, () => {
        count += 1;
      });

      return () => count;
    },
    saved,
    announced,
    played,
    tested,
    asked,
    addedBy,
    deleted,
    openedFiles,
    signedIn,
    loginCalls,
    activated,
    spellcheck,
    checked,
    folders,
    pickedAt,
    /** What the folder picker answers next, nothing as a cancel. */
    answerPicker: (folder: string | undefined) => {
      pickerAnswer = folder;
    },
    confirming: (next: boolean) => {
      confirms = next;
    },
    copied,
    opened,
    updater,
    /** How many times `/etc/os-release` was read. */
    osReleaseReads: system.osReleaseReads,
    /** Holds every call to the server until `release`. */
    hold,
    release,
    profiles,
    /** Polls the listed profiles' feeds, which answer with these, and lets each answer land. */
    poll: async (answers: Record<string, FeedOutcome>) => {
      for (const [profileId, outcome] of Object.entries(answers)) {
        feeds.set(profileId, outcome);
      }

      const { profileIds, unchecked } = mailPolls(profiles.get());

      mail.reconcile(profileIds, unchecked);
      await Promise.resolve();
      await Promise.resolve();
    },
    dispose: () => {
      entitlement.dispose();
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

  it("previews only Linen on the free version, which plays no other sound", async () => {
    const app = setup(stateOf("Work"), undefined, "darwin", ["en"], true);

    await expect(app.handlers.previewSound({ sound: "knock" })).rejects.toThrow(
      "needs Meru Pro"
    );
    await app.handlers.previewSound({ sound: "linen" });

    expect(app.played).toStrictEqual([{ sound: "linen", volume: 1 }]);
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
        enabled: true,
        asleep: false,
        checkMail: true,
        unifiedInbox: true,
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

  it("names no colour for one stored that this build does not know, until one is chosen", async () => {
    const state = stateOf("Home", "Work", "Club");
    const [home, work, club] = state.profiles;

    if (!home || !work || !club) {
      throw new Error("three profiles were made");
    }

    const app = setup({
      ...state,
      profiles: [home, { ...work, color: "teal" }, { ...club, color: "lime" }],
    });
    const named = () => app.read().profiles.map(({ colorName }) => colorName);

    expect(named()).toStrictEqual(["blue", null, "lime"]);

    await app.handlers.setProfileColor({ profileId: "work", color: "amber" });

    expect(named()).toStrictEqual(["blue", "amber", "lime"]);
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
    ).rejects.toThrow("The last enabled profile cannot be removed");
    expect(app.asked).toStrictEqual([]);
    app.dispose();
  });
});

describe("the Settings window's Gmail page", () => {
  it("sends the app value of each of the page's settings, the default where none is stored", () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      hidePromoBanner: false,
      verificationCodeCopyMode: "immediately",
      reverseConversation: "sometimes",
      verificationCodesDuringDoNotDisturb: "yes",
    });

    expect(
      Object.fromEntries(
        GMAIL_PAGE_KEYS.map((key) => [key, app.read().settings[key]])
      )
    ).toStrictEqual({
      hidePromoBanner: false,
      hideUpgradeButton: true,
      hideInboxFooter: true,
      extendDarkTheme: true,
      reverseConversation: false,
      moveAttachmentsToTop: false,
      showTrimmedContent: false,
      verificationCodes: true,
      verificationCodesDuringDoNotDisturb: true,
      verificationCodeCopyMode: "immediately",
      verificationCodeMarkRead: false,
      verificationCodeTrash: false,
    });
    app.dispose();
  });

  it("writes a switch's and the copy mode's app value, and sends it back", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.update({ key: "hideUpgradeButton", value: false });
    await app.handlers.update({
      key: "verificationCodeCopyMode",
      value: "immediately",
    });

    expect([
      app.saved.at(-1),
      app.read().settings.hideUpgradeButton,
      app.read().settings.verificationCodeCopyMode,
    ]).toStrictEqual([
      {
        version: 1,
        hideUpgradeButton: false,
        verificationCodeCopyMode: "immediately",
      },
      false,
      "immediately",
    ]);
    app.dispose();
  });
});

describe("the Settings window's General page", () => {
  it("sends each of the page's settings, the default where none is stored, and writes each", async () => {
    const app = setup(stateOf("Work"));
    const before = Object.fromEntries(
      GENERAL_PAGE_KEYS.map((key) => [key, app.read().settings[key]])
    );

    await app.handlers.update({ key: "openInBackground", value: true });
    await app.handlers.update({ key: "downloadsSaveAs", value: true });
    await app.handlers.update({ key: "downloadsShowInFolder", value: true });

    expect([before, app.saved.at(-1)]).toStrictEqual([
      {
        language: "system",
        spellcheckLanguages: [],
        openInBackground: false,
        downloadsSaveAs: false,
        downloadsShowInFolder: false,
      },
      {
        version: 1,
        openInBackground: true,
        downloadsSaveAs: true,
        downloadsShowInFolder: true,
      },
    ]);
    app.dispose();
  });

  it("shows the system's Downloads folder until one is chosen, from ~ on macOS", () => {
    const app = setup(stateOf("Work"));

    expect(app.read().general.downloadsFolder).toStrictEqual({
      path: "~/Downloads",
      available: true,
    });
    app.dispose();
  });

  it("chooses the folder through the picker, opened where downloads go now, and a cancel changes nothing", async () => {
    const app = setup(stateOf("Work"));
    const sends = app.sends();

    await app.handlers.chooseDownloadsFolder({});
    app.answerPicker("/Users/example/Mail");
    await app.handlers.chooseDownloadsFolder({});
    app.answerPicker(undefined);
    await app.handlers.chooseDownloadsFolder({});

    expect([
      app.pickedAt,
      app.saved,
      app.read().general.downloadsFolder,
      sends(),
    ]).toStrictEqual([
      [
        "/Users/example/Downloads",
        "/Users/example/Downloads",
        "/Users/example/Mail",
      ],
      [{ version: 1, downloadsFolder: "/Users/example/Mail" }],
      { path: "~/Mail", available: true },
      1,
    ]);
    app.dispose();
  });

  it("refuses a folder that is not a whole path", async () => {
    const app = setup(stateOf("Work"));

    app.answerPicker("Mail");

    await expect(app.handlers.chooseDownloadsFolder({})).rejects.toThrow(
      "The folder picker gave a relative path"
    );
    expect(app.saved).toStrictEqual([]);
    app.dispose();
  });

  it("says a chosen folder that is gone is not available, opens the picker at the system's, and keeps it as stored", async () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      downloadsFolder: "/Volumes/Gone/Downloads",
    });

    await app.handlers.chooseDownloadsFolder({});

    expect([
      app.read().general.downloadsFolder,
      app.pickedAt,
      app.read().settings,
    ]).toStrictEqual([
      { path: "/Volumes/Gone/Downloads", available: false },
      ["/Users/example/Downloads"],
      expect.not.objectContaining({ downloadsFolder: expect.anything() }),
    ]);
    expect(app.saved).toStrictEqual([]);
    app.dispose();
  });

  it("never takes the folder as a plain setting from the page", () => {
    expect(
      SETTINGS_CALLS.update.request.safeParse({
        key: "downloadsFolder",
        value: "/tmp",
      }).success
    ).toBeFalsy();
  });

  it("sets the login item, never a setting, and sends the page its state again", async () => {
    const app = setup(stateOf("Work"));
    const sends = app.sends();
    const before = app.read().general.openAtLogin;

    await app.handlers.setOpenAtLogin({ on: true });

    expect([
      before,
      app.read().general.openAtLogin,
      app.loginCalls,
      app.saved,
      sends(),
    ]).toStrictEqual([
      { on: false, real: false },
      { on: true, real: false },
      [true],
      [],
      1,
    ]);
    app.dispose();
  });

  it("has no login item on Linux, as v3, and refuses to set one", async () => {
    const app = setup(stateOf("Work"), undefined, "linux");

    await expect(app.handlers.setOpenAtLogin({ on: true })).rejects.toThrow(
      "Meru has no login item on Linux"
    );
    expect([app.read().general.openAtLogin, app.loginCalls]).toStrictEqual([
      null,
      [],
    ]);
    app.dispose();
  });
});

describe("the Settings window's Language and Spelling", () => {
  it("offers System and English while the build has English alone", () => {
    const app = setup(stateOf("Work"));

    expect([app.read().general.language, app.read().language]).toStrictEqual([
      { system: "English", choices: [{ language: "en", name: "English" }] },
      "en",
    ]);
    app.dispose();
  });

  it("offers System, named as the language it shows, and each language in its own name, and switches at once", async () => {
    const app = setup(stateOf("Work"), undefined, "darwin", ["en", "xx"]);
    const sent: string[] = [];

    onSettingsStateChange(app.deps, () => {
      sent.push(app.read().language);
    });

    expect(app.read().general.language).toStrictEqual({
      system: "English",
      choices: [
        { language: "en", name: "English" },
        { language: "xx", name: "xx" },
      ],
    });

    await app.handlers.update({ key: "language", value: "xx" });

    expect([app.read().language, app.activated]).toStrictEqual([
      "xx",
      ["en", "xx"],
    ]);
    expect(sent.at(-1)).toBe("xx");
    app.dispose();
  });

  it("has no Spelling on macOS, which checks with its own", () => {
    const app = setup(stateOf("Work"));

    expect(app.read().general.spelling).toBeNull();
    app.dispose();
  });

  it("offers every other language Chromium has a dictionary for on Linux, and a choice reaches each profile's session", async () => {
    const app = setup(stateOf("Work"), undefined, "linux");

    app.spellcheck?.prepare("persist:work");
    await app.handlers.setSpellcheckLanguage({ code: "de", on: true });

    expect([
      app.read().general.spelling,
      app.checked.get("persist:work"),
    ]).toStrictEqual([
      { always: ["en-US"], system: true, available: ["de", "fr"] },
      ["en-US", "de"],
    ]);
    app.dispose();
  });

  it("keeps both of two quick toggles, each applied to the list as stored, and takes one off alone", async () => {
    const app = setup(stateOf("Work"), undefined, "linux");

    await Promise.all([
      app.handlers.setSpellcheckLanguage({ code: "de", on: true }),
      app.handlers.setSpellcheckLanguage({ code: "fr", on: true }),
    ]);

    expect(app.read().settings.spellcheckLanguages).toStrictEqual(["de", "fr"]);

    await Promise.all([
      app.handlers.setSpellcheckLanguage({ code: "de", on: false }),
      app.handlers.setSpellcheckLanguage({ code: "fr", on: true }),
    ]);

    expect(app.read().settings.spellcheckLanguages).toStrictEqual(["fr"]);
    app.dispose();
  });

  it("refuses a spelling language on macOS, which checks with its own", async () => {
    const app = setup(stateOf("Work"));

    await expect(
      app.handlers.setSpellcheckLanguage({ code: "de", on: true })
    ).rejects.toThrow("macOS");
    expect(app.saved).toStrictEqual([]);
    app.dispose();
  });
});

describe("the Settings window's About page", () => {
  it("sends the app's version and macOS by its version, never reading os-release there", () => {
    const app = setup(stateOf("Work"));

    expect([app.read().about, app.osReleaseReads()]).toStrictEqual([
      { version: "4.0.0-dev.0", operatingSystem: "macOS 27.2 (arm64)" },
      0,
    ]);
    app.dispose();
  });

  it("reads os-release once on Linux, however often the state is read", () => {
    const app = setup(stateOf("Work"), undefined, "linux");

    app.read();

    expect([
      app.read().about.operatingSystem,
      app.osReleaseReads(),
    ]).toStrictEqual(["Ubuntu 24.04.3 LTS (arm64)", 1]);
    app.dispose();
  });

  it("copies exactly the string it sends", async () => {
    const app = setup(stateOf("Work"));
    const { version, operatingSystem } = app.read().about;

    await app.handlers.copyAboutValue({ item: "version" });
    await app.handlers.copyAboutValue({ item: "operatingSystem" });

    expect(app.copied).toStrictEqual([version, operatingSystem]);
    app.dispose();
  });
});

describe("the Settings window's Advanced page", () => {
  it("sends hardware acceleration on where none is stored, beside what the run started with", () => {
    const app = setup(stateOf("Work"));

    expect(
      Object.fromEntries(
        ADVANCED_PAGE_KEYS.map((key) => [key, app.read().settings[key]])
      )
    ).toStrictEqual({ hardwareAcceleration: true });
    expect(app.read().advanced).toStrictEqual({
      hardwareAccelerationAtLaunch: false,
    });
    app.dispose();
  });

  it("stores hardware acceleration off and resends the state", async () => {
    const app = setup(stateOf("Work"));
    const sends = app.sends();

    await app.handlers.update({ key: "hardwareAcceleration", value: false });

    expect(app.saved.at(-1)).toStrictEqual({
      version: 1,
      hardwareAcceleration: false,
    });
    expect(sends()).toBe(1);
    app.dispose();
  });

  it("opens the settings file", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.openSettingsFile({});

    expect(app.openedFiles).toStrictEqual(["/settings.json"]);
    app.dispose();
  });

  it("clears the cache alone of every stored profile, those the free version does not use included", async () => {
    const app = setup(
      stateOf("Work", "Home"),
      undefined,
      "darwin",
      ["en"],
      true
    );

    expect(
      app.read().lockedProfiles.map((profile) => profile.id)
    ).toStrictEqual(["home"]);

    await app.handlers.clearCache({});

    expect(app.deleted).toStrictEqual([
      ["work", { cookies: false, cache: true }],
      ["home", { cookies: false, cache: true }],
    ]);
    app.dispose();
  });
});

describe("the Settings window's Tabs & Apps page", () => {
  it("sends Open Google apps in Meru on, no app excluded, and unpinned tabs sleeping after an hour where none is stored", () => {
    const app = setup(stateOf("Work"));

    expect(
      Object.fromEntries(
        TABS_APPS_PAGE_KEYS.map((key) => [key, app.read().settings[key]])
      )
    ).toStrictEqual({
      openAppsInMeru: true,
      appsInDefaultBrowser: [],
      sleepIdleTabs: "unpinned",
      sleepAfter: "1h",
    });
    app.dispose();
  });

  it("keeps both of two quick toggles and an id this build does not know, applied to the list as stored", async () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      appsInDefaultBrowser: ["keep", 5],
    });

    await Promise.all([
      app.handlers.setAppInDefaultBrowser({ app: "drive", on: true }),
      app.handlers.setAppInDefaultBrowser({ app: "meet", on: true }),
    ]);
    await app.handlers.setAppInDefaultBrowser({ app: "drive", on: false });

    expect(app.saved.at(-1)).toStrictEqual({
      version: 1,
      appsInDefaultBrowser: ["keep", "meet"],
    });
    app.dispose();
  });

  it("refuses Gmail, which always opens in Meru", async () => {
    const app = setup(stateOf("Work"));

    await expect(
      app.handlers.setAppInDefaultBrowser({ app: "gmail", on: true })
    ).rejects.toThrow("Gmail");
    expect(app.saved).toStrictEqual([]);
    app.dispose();
  });

  it("writes neither on the free version, and sends their free values with the stored ones kept", async () => {
    const app = setup(
      stateOf("Work"),
      { version: 1, appsInDefaultBrowser: ["drive"] },
      "darwin",
      ["en"],
      true
    );

    await expect(
      app.handlers.update({ key: "openAppsInMeru", value: false })
    ).rejects.toThrow("Meru Pro");
    await expect(
      app.handlers.setAppInDefaultBrowser({ app: "meet", on: true })
    ).rejects.toThrow("Meru Pro");

    expect([
      app.read().settings.openAppsInMeru,
      app.read().settings.appsInDefaultBrowser,
      app.saved,
    ]).toStrictEqual([false, [], []]);
    app.dispose();
  });
});

describe("the Settings window's Appearance page", () => {
  it("sends each of the page's settings, the default where none is stored", () => {
    const app = setup(stateOf("Work"), { version: 1, theme: "light" });

    expect(
      Object.fromEntries(
        APPEARANCE_PAGE_KEYS.map((key) => [key, app.read().settings[key]])
      )
    ).toStrictEqual({
      theme: "light",
      profileTint: true,
      titlebarNewTab: true,
      titlebarUnifiedInbox: true,
      titlebarDownloads: true,
      titlebarDoNotDisturb: true,
    });
    app.dispose();
  });

  it("writes each one, and hiding the Do Not Disturb button leaves Do Not Disturb as it was", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.setDoNotDisturb({ on: true });
    await app.handlers.update({ key: "theme", value: "dark" });
    await app.handlers.update({ key: "profileTint", value: false });
    await app.handlers.update({ key: "titlebarDoNotDisturb", value: false });

    expect([app.saved.at(-1), app.read().doNotDisturb.on]).toStrictEqual([
      {
        version: 1,
        theme: "dark",
        profileTint: false,
        titlebarDoNotDisturb: false,
      },
      true,
    ]);
    app.dispose();
  });
});

describe("the Settings window's Privacy & Security page", () => {
  it("sends the blocker's switches and Ask before opening links, each on where none is stored, and the trusted sites as stored", () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      blockTrackers: false,
      trustedSites: ["https://a.example", 5, "http://b.example:8080"],
    });

    expect([
      Object.fromEntries(
        PRIVACY_PAGE_KEYS.map((key) => [key, app.read().settings[key]])
      ),
      app.read().trustedSites,
    ]).toStrictEqual([
      { blockAds: true, blockTrackers: false, confirmLinks: true },
      ["https://a.example", "http://b.example:8080"],
    ]);
    app.dispose();
  });

  it("writes each switch on its own, neither blocker switch touching the other", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.update({ key: "blockAds", value: false });
    await app.handlers.update({ key: "confirmLinks", value: false });

    expect(app.saved.at(-1)).toStrictEqual({
      version: 1,
      blockAds: false,
      confirmLinks: false,
    });
    app.dispose();
  });

  it("removes one site at a time from the list as stored, so two quick removals both hold, and a site not listed changes nothing", async () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      trustedSites: [
        "https://a.example",
        "https://b.example",
        "https://c.example",
      ],
    });
    const sends = app.sends();

    await Promise.all([
      app.handlers.removeTrustedSite({ site: "https://a.example" }),
      app.handlers.removeTrustedSite({ site: "https://c.example" }),
    ]);

    const written = app.saved.length;
    const sent = sends();

    await app.handlers.removeTrustedSite({ site: "https://elsewhere.example" });

    expect([
      app.read().trustedSites,
      written > 0 && sent > 0,
      app.saved.length - written,
      sends() - sent,
    ]).toStrictEqual([["https://b.example"], true, 0, 0]);
    app.dispose();
  });

  it("never takes the whole list from the window", () => {
    expect(
      SETTINGS_CALLS.update.request.safeParse({
        key: "trustedSites",
        value: ["https://a.example"],
      }).success
    ).toBeFalsy();
  });
});

describe("the Settings window's Menu Bar & Dock page", () => {
  it("sends each of the page's settings, the platform's default where none is stored", () => {
    const app = setup(stateOf("Work"), { version: 1, trayJumpsToUnread: true });

    expect(
      Object.fromEntries(
        MENU_BAR_PAGE_KEYS.map((key) => [key, app.read().settings[key]])
      )
    ).toStrictEqual({
      dockIcon: true,
      tray: false,
      trayUnreadCount: true,
      trayIconColor: "system",
      trayJumpsToUnread: true,
    });
    app.dispose();
  });

  it("refuses to hide the Dock icon while the menu bar icon is off, writing nothing", async () => {
    const app = setup(stateOf("Work"));

    await expect(
      app.handlers.update({ key: "dockIcon", value: false })
    ).rejects.toThrow(
      "The Dock icon cannot hide while the menu bar icon is off"
    );
    expect(app.saved).toStrictEqual([]);
    app.dispose();
  });

  it("refuses to hide the Dock icon sent while the menu bar icon is still being turned off", async () => {
    const app = setup(stateOf("Work"), { version: 1, tray: true });

    const trayOff = app.handlers.update({ key: "tray", value: false });
    const dockOff = app.handlers.update({ key: "dockIcon", value: false });

    await trayOff;
    await expect(dockOff).rejects.toThrow(
      "The Dock icon cannot hide while the menu bar icon is off"
    );
    expect(app.saved).toStrictEqual([{ version: 1, tray: false }]);
    app.dispose();
  });

  it("hides the Dock icon once the menu bar icon shows, and shows it again", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.update({ key: "tray", value: true });
    await app.handlers.update({ key: "dockIcon", value: false });
    await app.handlers.update({ key: "dockIcon", value: true });

    expect(app.saved).toStrictEqual([
      { version: 1, tray: true },
      { version: 1, tray: true, dockIcon: false },
      { version: 1, tray: true, dockIcon: true },
    ]);
    app.dispose();
  });
});

/** Three profiles on the free version, the first holding a value of its own. */
const freeWithThree = () =>
  setup(
    stateOf("Personal", "Work", "Home"),
    { version: 1, profiles: { personal: { notificationSender: false } } },
    "darwin",
    ["en"],
    true
  );

describe(readSettingsState, () => {
  it("lists the profiles the free version does not use apart, each in its own colour, and reads no profile's own values", () => {
    const { read } = freeWithThree();
    const { profiles, lockedProfiles } = read();

    expect(profiles.map(({ id, overrides }) => [id, overrides])).toStrictEqual([
      ["personal", {}],
    ]);
    expect(lockedProfiles).toStrictEqual([
      { id: "work", name: "Work", color: expect.any(String) },
      { id: "home", name: "Home", color: expect.any(String) },
    ]);
    expect(
      new Set([profiles[0]?.color, ...lockedProfiles.map(({ color }) => color)])
        .size
    ).toBe(3);
  });

  it("refuses to add a profile or open one it does not use, and says what needs Meru Pro until a license", async () => {
    const { read, handlers, deps } = freeWithThree();

    expect(read().proRequired).toContain("profiles");
    await expect(handlers.addProfile({})).rejects.toThrow(
      "The profile was not added"
    );
    await expect(
      handlers.openPage({ section: "profiles", profileId: "work" })
    ).rejects.toThrow("No listed profile has the id work");

    await deps.entitlement.activate("MERU-TEST-AAAA-BBBB-CCCC-7Q2K");

    const licensed = read();

    expect([
      licensed.proRequired,
      licensed.profiles.map(({ id, overrides }) => [id, overrides]),
      licensed.lockedProfiles,
    ]).toStrictEqual([
      [],
      [
        ["personal", { notificationSender: false }],
        ["work", {}],
        ["home", {}],
      ],
      [],
    ]);
    await expect(
      handlers.openPage({ section: "profiles", profileId: "work" })
    ).resolves.toBeUndefined();
  });

  it("writes no profile's own value on the free version, Show in Unified inbox included, until a license", async () => {
    const { handlers, deps, saved } = freeWithThree();
    const refused = await Promise.allSettled([
      handlers.setOverride({
        profileId: "personal",
        key: "notifications",
        value: false,
      }),
      handlers.clearOverride({
        profileId: "personal",
        key: "notificationSender",
      }),
      handlers.setUnifiedInbox({ profileId: "personal", on: false }),
    ]);

    expect([refused.map(({ status }) => status), saved]).toStrictEqual([
      ["rejected", "rejected", "rejected"],
      [],
    ]);

    await deps.entitlement.activate("MERU-TEST-AAAA-BBBB-CCCC-7Q2K");
    await handlers.setUnifiedInbox({ profileId: "work", on: false });

    expect(saved).toStrictEqual([
      {
        version: 1,
        profiles: {
          personal: { notificationSender: false },
          work: { unifiedInbox: false },
        },
      },
    ]);
  });

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
        enabled: true,
        asleep: false,
        checkMail: true,
        unifiedInbox: true,
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
        enabled: true,
        asleep: false,
        checkMail: true,
        unifiedInbox: true,
        mail: { status: "unknown", address: null },
        savedSearches: [],
        overrides: {},
      },
      {
        id: "work",
        name: "Work",
        color: "#ff6227",
        colorName: "orange",
        enabled: true,
        asleep: false,
        checkMail: true,
        unifiedInbox: true,
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

describe("the Settings window's Show in Unified inbox", () => {
  it("writes a profile's own value only while it differs from the app's, and never counts it among the page's overrides", async () => {
    const app = setup(stateOf("Home", "Work"));
    const inbox = () =>
      app.read().profiles.map((profile) => profile.unifiedInbox);

    await app.handlers.setUnifiedInbox({ profileId: "work", on: false });

    const off = {
      inbox: inbox(),
      file: app.saved.at(-1),
      overrides: app.read().profiles[1]?.overrides,
    };

    await app.handlers.setUnifiedInbox({ profileId: "work", on: true });

    expect([off, inbox(), app.saved.at(-1)]).toStrictEqual([
      {
        inbox: [true, false],
        file: { version: 1, profiles: { work: { unifiedInbox: false } } },
        overrides: {},
      },
      [true, true],
      { version: 1 },
    ]);
    app.dispose();
  });

  it("sends the Settings window its state again when a profile's value is set and when it is cleared", async () => {
    const app = setup(stateOf("Home", "Work"));
    const sent = app.sends();

    await app.handlers.setUnifiedInbox({ profileId: "work", on: false });

    const afterSet = sent();

    await app.handlers.setUnifiedInbox({ profileId: "work", on: true });

    expect([afterSet > 0, sent() > afterSet]).toStrictEqual([true, true]);
    app.dispose();
  });

  it("keeps an app value of false from an earlier build: a profile without its own stays out, and one switched on holds true", async () => {
    const app = setup(stateOf("Home", "Work"), {
      version: 1,
      unifiedInbox: false,
    });
    const inbox = () =>
      app.read().profiles.map((profile) => profile.unifiedInbox);
    const before = inbox();

    await app.handlers.setUnifiedInbox({ profileId: "home", on: true });

    const on = { inbox: inbox(), file: app.saved.at(-1) };

    await app.handlers.setUnifiedInbox({ profileId: "home", on: false });

    expect([before, on, inbox(), app.saved.at(-1)]).toStrictEqual([
      [false, false],
      {
        inbox: [true, false],
        file: {
          version: 1,
          unifiedInbox: false,
          profiles: { home: { unifiedInbox: true } },
        },
      },
      [false, false],
      { version: 1, unifiedInbox: false },
    ]);
    app.dispose();
  });

  it("sends a lone profile that holds only its own Unified inbox no override, so the page has no scopes", () => {
    const app = setup(stateOf("Work"), {
      version: 1,
      profiles: { work: { unifiedInbox: false } },
    });

    expect(
      app.read().profiles.map(({ unifiedInbox, overrides }) => ({
        unifiedInbox,
        overrides,
      }))
    ).toStrictEqual([{ unifiedInbox: false, overrides: {} }]);
    app.dispose();
  });

  it("refuses an unlisted profile", async () => {
    const app = setup(stateOf("Home", "Work"));

    await expect(
      app.handlers.setUnifiedInbox({ profileId: "gone", on: false })
    ).rejects.toThrow("No listed profile has the id gone");
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

describe("the Settings window's Enabled", () => {
  it("turns a profile off, which stops its mail and gives the selection away, and on again as it was", async () => {
    const app = setup(stateOf("Home", "Work", "Club"));

    await app.poll({
      home: {
        kind: "feed",
        feed: { unreadCount: 0, entries: [], address: "home@example.org" },
      },
      work: {
        kind: "feed",
        feed: { unreadCount: 0, entries: [], address: "work@example.org" },
      },
      club: { kind: "signedOut" },
    });
    await app.profiles.sleep("club");
    await app.handlers.setProfileEnabled({ profileId: "home", enabled: false });
    await app.poll({
      work: {
        kind: "feed",
        feed: { unreadCount: 0, entries: [], address: "work@example.org" },
      },
    });

    const off = app
      .read()
      .profiles.map((profile) => [
        profile.id,
        profile.enabled,
        profile.asleep,
        profile.mail.status,
      ]);
    const selected = app.profiles.get().selectedProfileId;

    await app.handlers.setProfileEnabled({ profileId: "home", enabled: true });
    await app.poll({
      home: {
        kind: "feed",
        feed: { unreadCount: 0, entries: [], address: "home@example.org" },
      },
    });

    expect([
      off,
      selected,
      app.read().profiles[0]?.enabled,
      app.read().profiles[0]?.mail.status,
    ]).toStrictEqual([
      [
        ["home", false, false, "notChecked"],
        ["work", true, false, "ok"],
        ["club", true, true, "signedOut"],
      ],
      "work",
      true,
      "ok",
    ]);
    app.dispose();
  });

  it("refuses the last enabled profile, to turn off or remove, and an unlisted one", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.setProfileEnabled({ profileId: "work", enabled: false });
    // Asked twice, as a switch pressed twice quickly asks.
    await app.handlers.setProfileEnabled({ profileId: "work", enabled: false });

    expect([
      await refusal(
        app.handlers.setProfileEnabled({ profileId: "home", enabled: false })
      ),
      await refusal(app.handlers.removeProfile({ profileId: "home" })),
      await refusal(
        app.handlers.setAsleep({ profileId: "work", asleep: true })
      ),
      await refusal(
        app.handlers.setProfileEnabled({ profileId: "gone", enabled: true })
      ),
      app.read().profiles.map((profile) => profile.enabled),
    ]).toStrictEqual([
      "The last enabled profile cannot be turned off",
      "The last enabled profile cannot be removed",
      "A profile turned off neither sleeps nor wakes",
      "No listed profile has the id gone",
      [true, false],
    ]);
    app.dispose();
  });
});

describe("the Settings window's Delete browsing data", () => {
  it("deletes what a listed profile asks for, a disabled one too, and refuses neither chosen or an unlisted profile", async () => {
    const app = setup(stateOf("Home", "Work"));

    await app.handlers.setProfileEnabled({ profileId: "work", enabled: false });
    await app.handlers.deleteBrowsingData({
      profileId: "home",
      cookies: false,
      cache: true,
    });
    await app.handlers.deleteBrowsingData({
      profileId: "work",
      cookies: true,
      cache: false,
    });

    expect([
      await refusal(
        app.handlers.deleteBrowsingData({
          profileId: "home",
          cookies: false,
          cache: false,
        })
      ),
      await refusal(
        app.handlers.deleteBrowsingData({
          profileId: "gone",
          cookies: true,
          cache: true,
        })
      ),
      app.deleted,
    ]).toStrictEqual([
      "Neither cookies nor the cache was chosen to delete",
      "No listed profile has the id gone",
      [
        ["home", { cookies: false, cache: true }],
        ["work", { cookies: true, cache: false }],
      ],
    ]);
    app.dispose();
  });
});

describe("the Settings window's Sign in", () => {
  it("signs in a listed profile, asleep included, and refuses one turned off or unlisted", async () => {
    const app = setup(stateOf("Home", "Work", "Club"));

    await app.profiles.sleep("work");
    await app.handlers.setProfileEnabled({ profileId: "club", enabled: false });
    await app.handlers.signIn({ profileId: "work" });

    expect([
      await refusal(app.handlers.signIn({ profileId: "club" })),
      await refusal(app.handlers.signIn({ profileId: "gone" })),
      app.signedIn,
    ]).toStrictEqual([
      "A profile turned off cannot be signed in to",
      "No listed profile has the id gone",
      ["work"],
    ]);
    app.dispose();
  });
});

describe("the Settings window's Meru Pro page", () => {
  const KEY = "MERU-TEST-AAAA-BBBB-CCCC-7Q2K";

  it("sends the entitlement with the key masked, and the whole key never", async () => {
    const app = setup(stateOf("Work"), undefined, "darwin", ["en"], true);
    const before = app.read();

    await expect(
      app.handlers.activateLicense({ licenseKey: KEY })
    ).resolves.toStrictEqual({ ok: true });

    const after = app.read();

    expect([
      before.entitlement.status,
      before.entitlement.licenseKey,
      before.licenseRequest,
      after.entitlement.status,
      after.entitlement.licenseKey,
      after.entitlement.deviceName,
      JSON.stringify(after).includes(KEY),
    ]).toStrictEqual([
      "none",
      null,
      false,
      "licensed",
      "MERU-••••-••••-••••-••••-7Q2K",
      expect.stringMatching(/^Device [\dA-F]{4}$/u),
      false,
    ]);
    app.dispose();
  });

  it("answers a refused or malformed key with main's own wording", async () => {
    const app = setup(stateOf("Work"), undefined, "darwin", ["en"], true);
    const answers = [];

    for (const licenseKey of [
      "not a key",
      "MERU-USED-0000-0000-0000",
      "MERU-0000-0000-0000-0000",
    ]) {
      // oxlint-disable-next-line no-await-in-loop -- one request at a time
      answers.push(await app.handlers.activateLicense({ licenseKey }));
    }

    expect(answers).toStrictEqual(
      (["malformed", "deviceLimit", "invalidKey"] as const).map((error) => ({
        ok: false,
        error,
        message: entitlementErrorMessage(error),
      }))
    );
    expect(app.read().entitlement.status).toBe("none");
    app.dispose();
  });

  it("has one activation, rename or retry out at a time, refusing the others, and says so to every window", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.activateLicense({ licenseKey: KEY });

    const sends = app.sends();

    app.hold();

    const renaming = app.handlers.setDeviceName({ name: "Studio" });
    const out = app.read().licenseRequest;
    const refused = await Promise.allSettled([
      app.handlers.activateLicense({ licenseKey: KEY }),
      app.handlers.setDeviceName({ name: "Office" }),
      app.handlers.retryEntitlement(undefined),
    ]);

    app.release();

    await expect(renaming).resolves.toStrictEqual({ ok: true });
    expect([
      out,
      refused.map(({ status }) => status),
      app.read().licenseRequest,
      app.read().entitlement.deviceName,
      sends() >= 2,
    ]).toStrictEqual([
      true,
      ["rejected", "rejected", "rejected"],
      false,
      "Studio",
      true,
    ]);

    await expect(
      app.handlers.retryEntitlement(undefined)
    ).resolves.toBeUndefined();
    app.dispose();
  });

  it("gives the device back its generated name for an empty one", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.activateLicense({ licenseKey: KEY });

    const generated = app.read().entitlement.deviceName;

    await app.handlers.setDeviceName({ name: "Studio" });
    await app.handlers.setDeviceName({ name: "  " });

    expect(app.read().entitlement.deviceName).toBe(generated);
    app.dispose();
  });

  it("copies the whole key from main, and opens Meru Pro's page in Meru's own browser", async () => {
    const app = setup(stateOf("Work"));

    await expect(app.handlers.copyLicenseKey(undefined)).resolves.toMatchObject(
      { ok: false, error: "noLicense" }
    );
    await app.handlers.activateLicense({ licenseKey: KEY });
    await app.handlers.copyLicenseKey(undefined);
    await app.handlers.openMeruPro(undefined);

    expect([app.copied, app.opened]).toStrictEqual([[KEY], [MERU_PRO_URL]]);
    app.dispose();
  });

  it("takes no address from the window to open", () => {
    expect(
      SETTINGS_CALLS.openMeruPro.request.safeParse("https://example.com")
        .success
    ).toBeFalsy();
  });
});

describe("the Settings window's Updates", () => {
  it("sends where updating stands, and again as it changes", async () => {
    const app = setup(stateOf("Work"));
    const sends = app.sends();

    expect(app.read().updates).toStrictEqual({
      status: "idle",
      version: null,
      lastChecked: null,
    });

    await app.handlers.checkForUpdates({});
    await app.updater.emit({ kind: "checking" });
    await app.updater.emit({ kind: "notAvailable" });

    expect([app.read().updates, sends()]).toStrictEqual([
      { status: "upToDate", version: null, lastChecked: 1000 },
      2,
    ]);
    app.dispose();
  });

  it("installs a ready version, and opens a refused one's release page", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.checkForUpdates({});
    await app.updater.emit({ kind: "available", version: "4.2.0" });
    await app.updater.emit({ kind: "downloaded", version: "4.2.0" });
    await app.handlers.restartToUpdate({});
    await app.handlers.checkForUpdates({});
    await app.updater.emit({ kind: "available", version: "4.3.0" });
    await app.updater.emit({ kind: "error", signature: true });
    await app.handlers.openUpdateRelease({});

    expect([
      app.updater.calls.includes("quitAndInstall"),
      app.opened,
    ]).toStrictEqual([
      true,
      ["https://github.com/zoidsh/meru/releases/tag/v4.3.0"],
    ]);
    app.dispose();
  });

  it("writes the switch and the channel as page settings", async () => {
    const app = setup(stateOf("Work"));

    await app.handlers.update({ key: "autoUpdate", value: false });
    await app.handlers.update({ key: "updateChannel", value: "beta" });

    expect([
      app.read().settings.autoUpdate,
      app.read().settings.updateChannel,
    ]).toStrictEqual([false, "beta"]);
    app.dispose();
  });
});
