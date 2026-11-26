import { describe, expect, it } from "vitest";

import { SETTINGS_CALLS, SETTINGS_STATE } from "./settings.ts";

const accepts =
  (schema: { safeParse: (value: unknown) => { success: boolean } }) =>
  (value: unknown) =>
    schema.safeParse(value).success;

describe("the settings contract", () => {
  it("takes a new app value of one of the page's settings, checked by that setting's schema", () => {
    const update = accepts(SETTINGS_CALLS.update.request);

    expect([
      update({ key: "notifications", value: false }),
      update({ key: "notificationSound", value: "chime" }),
      update({
        key: "quietHours",
        value: [{ start: "22:00", end: "07:00", days: [1, 2] }],
      }),
      update({ key: "notificationSoundVolume", value: 0.05 }),
      update({ key: "notificationSoundVolume", value: 1 }),
    ]).toStrictEqual([true, true, true, true, true]);
  });

  it("takes the Gmail page's settings, checked by each one's schema", () => {
    const update = accepts(SETTINGS_CALLS.update.request);

    expect([
      update({ key: "hidePromoBanner", value: false }),
      update({ key: "extendDarkTheme", value: true }),
      update({ key: "verificationCodes", value: false }),
      update({ key: "verificationCodeCopyMode", value: "immediately" }),
      update({ key: "verificationCodeCopyMode", value: "notificationClick" }),
      update({ key: "verificationCodeTrash", value: true }),
      update({ key: "hideInboxFooter", value: "no" }),
      update({ key: "verificationCodeCopyMode", value: "later" }),
      update({ key: "verificationCodeMarkRead", value: 1 }),
      update({ key: "hideGmailLogo", value: false }),
    ]).toStrictEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it("takes the Menu Bar & Dock page's settings, checked by each one's schema", () => {
    const update = accepts(SETTINGS_CALLS.update.request);

    expect([
      update({ key: "dockIcon", value: false }),
      update({ key: "tray", value: true }),
      update({ key: "trayUnreadCount", value: false }),
      update({ key: "trayIconColor", value: "light" }),
      update({ key: "trayJumpsToUnread", value: true }),
      update({ key: "dockIcon", value: "hidden" }),
      update({ key: "trayIconColor", value: "blue" }),
      update({ key: "tray", value: 0 }),
    ]).toStrictEqual([true, true, true, true, true, false, false, false]);
  });

  it("takes the Appearance page's settings, checked by each one's schema", () => {
    const update = accepts(SETTINGS_CALLS.update.request);

    expect([
      update({ key: "theme", value: "dark" }),
      update({ key: "profileTint", value: false }),
      update({ key: "titlebarNewTab", value: false }),
      update({ key: "titlebarUnifiedInbox", value: true }),
      update({ key: "titlebarDownloads", value: false }),
      update({ key: "titlebarDoNotDisturb", value: true }),
      update({ key: "theme", value: "sepia" }),
      update({ key: "profileTint", value: "on" }),
      update({ key: "titlebarDownloads", value: 1 }),
    ]).toStrictEqual([true, true, true, true, true, true, false, false, false]);
  });

  it("refuses a value of the wrong kind, a setting off the page and anything malformed", () => {
    const update = accepts(SETTINGS_CALLS.update.request);

    expect([
      update({ key: "notifications", value: "yes" }),
      update({ key: "notificationSound", value: "trumpet" }),
      update({ key: "quietHours", value: [{ start: "25:00", end: "07:00" }] }),
      update({
        key: "quietHours",
        value: [{ start: "22:00", end: "07:00", days: [7] }],
      }),
      update({ key: "notificationSoundVolume", value: 0 }),
      update({ key: "notificationSoundVolume", value: 1.5 }),
      update({ key: "trayIcon", value: false }),
      update({ key: "unifiedInbox", value: true }),
      update({ key: "version", value: 2 }),
      update({ value: true }),
      update(undefined),
    ]).toStrictEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("takes a profile's own value of one of the page's settings, checked by that setting's schema, and which to clear", () => {
    const setOverride = accepts(SETTINGS_CALLS.setOverride.request);
    const clearOverride = accepts(SETTINGS_CALLS.clearOverride.request);

    expect([
      setOverride({ profileId: "work", key: "notifications", value: false }),
      setOverride({ profileId: "work", key: "quietHours", value: [] }),
      clearOverride({ profileId: "work", key: "notificationSound" }),
    ]).toStrictEqual([true, true, true]);
  });

  it("refuses an override of an app-only setting, a value of the wrong kind or no profile", () => {
    const setOverride = accepts(SETTINGS_CALLS.setOverride.request);
    const clearOverride = accepts(SETTINGS_CALLS.clearOverride.request);

    expect([
      setOverride({ profileId: "work", key: "trayIcon", value: "dark" }),
      setOverride({ profileId: "work", key: "notifications", value: "no" }),
      setOverride({ profileId: "", key: "notifications", value: false }),
      setOverride({ key: "notifications", value: false }),
      setOverride({
        profileId: "work",
        key: "notificationSoundVolume",
        value: 0.5,
      }),
      setOverride({ profileId: "work", key: "unifiedInbox", value: false }),
      clearOverride({ profileId: "work", key: "verificationCodes" }),
      clearOverride({ profileId: "work", key: "notificationSoundVolume" }),
      clearOverride({ profileId: "work", key: "unifiedInbox" }),
      clearOverride({ profileId: "work" }),
    ]).toStrictEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("sends each profile's own values of the page's settings, only those", () => {
    const { profiles } = SETTINGS_STATE;
    const work = {
      id: "work",
      name: "Work",
      color: "#ff6227",
      colorName: "orange",
      enabled: true,
      asleep: false,
      checkMail: true,
      unifiedInbox: true,
      mail: { status: "ok", address: "work@example.org" },
      savedSearches: [],
      overrides: { notificationSound: "chime" },
    };

    expect([
      profiles.safeParse([work]).success,
      profiles.safeParse([
        { ...work, overrides: { notificationSound: "trumpet" } },
      ]).success,
      profiles.parse([
        {
          ...work,
          overrides: {
            trayIcon: "dark",
            notificationSoundVolume: 0.5,
            unifiedInbox: false,
          },
        },
      ])[0]?.overrides,
    ]).toStrictEqual([true, false, {}]);
  });

  it("tells a profile's mail by one of its statuses, with an address or null", () => {
    const [entry] = SETTINGS_STATE.profiles.parse([
      {
        id: "work",
        name: "Work",
        color: "#ff6227",
        colorName: "orange",
        enabled: true,
        asleep: true,
        checkMail: false,
        unifiedInbox: false,
        mail: { status: "notChecked", address: null },
        savedSearches: [],
        overrides: {},
      },
    ]);
    const withMail = (mail: unknown) =>
      SETTINGS_STATE.profiles.safeParse([{ ...entry, mail }]).success;

    expect([
      entry?.mail,
      withMail({ status: "signedOut", address: null }),
      withMail({ status: "asleep", address: null }),
      withMail({ status: "ok" }),
    ]).toStrictEqual([
      { status: "notChecked", address: null },
      true,
      false,
      false,
    ]);
  });

  it("sets a listed profile's Check mail, Unified inbox and sleep by its id and a boolean", () => {
    const setCheckMail = accepts(SETTINGS_CALLS.setCheckMail.request);
    const setUnifiedInbox = accepts(SETTINGS_CALLS.setUnifiedInbox.request);
    const setAsleep = accepts(SETTINGS_CALLS.setAsleep.request);

    expect([
      setCheckMail({ profileId: "work", on: false }),
      setCheckMail({ profileId: "", on: false }),
      setUnifiedInbox({ profileId: "work", on: false }),
      setUnifiedInbox({ profileId: "work", on: "no" }),
      setUnifiedInbox({ on: true }),
      setAsleep({ profileId: "work", asleep: true }),
      setAsleep({ profileId: "work", asleep: "yes" }),
    ]).toStrictEqual([true, false, true, false, false, true, false]);
  });

  it("adds, renames and removes a saved search by the profile's and the search's ids", () => {
    const add = accepts(SETTINGS_CALLS.addSavedSearch.request);
    const answer = accepts(SETTINGS_CALLS.addSavedSearch.response);
    const rename = accepts(SETTINGS_CALLS.renameSavedSearch.request);
    const remove = accepts(SETTINGS_CALLS.removeSavedSearch.request);

    expect([
      add({ profileId: "work", query: "is:unread", name: "" }),
      add({ profileId: "work", query: "is:unread" }),
      answer(null),
      answer("duplicate"),
      answer("taken"),
      rename({ profileId: "work", searchId: "s1", name: "Unread" }),
      rename({ profileId: "work", searchId: "", name: "Unread" }),
      remove({ profileId: "work", searchId: "s1" }),
      remove({ profileId: "work" }),
    ]).toStrictEqual([
      true,
      false,
      true,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
  });

  it("sends a profile's saved searches with a name or null", () => {
    const { profiles } = SETTINGS_STATE;
    const withSearches = (savedSearches: unknown) =>
      profiles.safeParse([
        {
          id: "work",
          name: "Work",
          color: "#ff6227",
          colorName: "orange",
          enabled: true,
          asleep: false,
          checkMail: true,
          unifiedInbox: true,
          mail: { status: "ok", address: null },
          savedSearches,
          overrides: {},
        },
      ]).success;

    expect([
      withSearches([
        { id: "a", query: "is:unread", name: null },
        { id: "b", query: "has:attachment", name: "Files" },
      ]),
      withSearches([{ id: "a", query: "is:unread" }]),
    ]).toStrictEqual([true, false]);
  });

  it("switches Do Not Disturb on or off and nothing else", () => {
    const setDoNotDisturb = accepts(SETTINGS_CALLS.setDoNotDisturb.request);

    expect([
      setDoNotDisturb({ on: true }),
      setDoNotDisturb({ on: false }),
      setDoNotDisturb({}),
      setDoNotDisturb({ on: "until 14:30" }),
    ]).toStrictEqual([true, true, false, false]);
  });

  it("previews one of Meru's sounds, never the system's, none or another", () => {
    const previewSound = accepts(SETTINGS_CALLS.previewSound.request);

    expect([
      previewSound({ sound: "chime" }),
      previewSound({ sound: "linen" }),
      previewSound({ sound: "system" }),
      previewSound({ sound: "none" }),
      previewSound({ sound: "trumpet" }),
      previewSound({ sound: "chime", volume: 2 }),
      previewSound({}),
    ]).toStrictEqual([true, true, false, false, false, true, false]);
  });

  it("shows a test notification for the app or a profile named by its id", () => {
    const showTest = accepts(SETTINGS_CALLS.showTestNotification.request);

    expect([
      showTest({ profileId: null }),
      showTest({ profileId: "work" }),
      showTest({ profileId: "" }),
      showTest({ profileId: 3 }),
      showTest({}),
    ]).toStrictEqual([true, true, false, false, false]);
  });

  it("sends the pages' settings, and only them", () => {
    const { settings } = SETTINGS_STATE;
    const values = {
      notifications: true,
      notificationSender: true,
      notificationSubject: true,
      notificationSummary: true,
      notificationImportantOnly: false,
      quietHours: [],
      notificationSound: "linen",
      unreadBadge: true,
      notificationSoundVolume: 0.5,
      hidePromoBanner: true,
      hideUpgradeButton: false,
      hideInboxFooter: true,
      extendDarkTheme: true,
      reverseConversation: false,
      moveAttachmentsToTop: true,
      showTrimmedContent: false,
      verificationCodes: true,
      verificationCodeCopyMode: "notificationClick",
      verificationCodeMarkRead: false,
      verificationCodeTrash: false,
      language: "system",
      spellcheckLanguages: ["de"],
      openInBackground: true,
      downloadsSaveAs: true,
      downloadsShowInFolder: false,
      theme: "dark",
      profileTint: false,
      titlebarNewTab: true,
      titlebarUnifiedInbox: false,
      titlebarDownloads: true,
      titlebarDoNotDisturb: false,
      dockIcon: false,
      tray: true,
      trayUnreadCount: true,
      trayIconColor: "dark",
      trayJumpsToUnread: false,
      blockAds: true,
      blockTrackers: false,
      confirmLinks: true,
      openAppsInMeru: false,
      appsInDefaultBrowser: ["drive"],
      sleepIdleTabs: "chosen",
      sleepAfter: "6h",
      hardwareAcceleration: false,
    };

    expect([
      settings.safeParse(values).success,
      Object.keys(
        settings.parse({
          ...values,
          trayIcon: true,
          unifiedInbox: false,
          trustedSites: ["https://a.example"],
        })
      ).toSorted(),
    ]).toStrictEqual([true, Object.keys(values).toSorted()]);
  });

  it("takes a section, or a profile's page, to open", () => {
    const openPage = accepts(SETTINGS_CALLS.openPage.request);

    expect([
      openPage({ section: "profiles", profileId: null }),
      openPage({ section: "profiles", profileId: "work" }),
      openPage({ section: "notifications", profileId: null }),
      openPage({ section: "gmail", profileId: null }),
      openPage({ section: "general", profileId: null }),
      openPage({ section: "shortcuts", profileId: null }),
      openPage({ section: "profiles", profileId: "" }),
      openPage({ section: "profiles" }),
    ]).toStrictEqual([true, true, true, true, true, false, false, false]);
  });

  it("takes a profile's new name, one of the eight colours, and a place from 0", () => {
    const rename = accepts(SETTINGS_CALLS.renameProfile.request);
    const color = accepts(SETTINGS_CALLS.setProfileColor.request);
    const move = accepts(SETTINGS_CALLS.moveProfile.request);
    const remove = accepts(SETTINGS_CALLS.removeProfile.request);

    expect([
      rename({ profileId: "work", name: "Job" }),
      rename({ profileId: "work" }),
      color({ profileId: "work", color: "violet" }),
      color({ profileId: "work", color: "teal" }),
      color({ profileId: "work", color: "#2d52d2" }),
      move({ profileId: "work", toIndex: 0 }),
      move({ profileId: "work", toIndex: -1 }),
      move({ profileId: "work", toIndex: 1.5 }),
      remove({ profileId: "work" }),
      remove({ profileId: "" }),
    ]).toStrictEqual([
      true,
      false,
      true,
      false,
      false,
      true,
      false,
      false,
      true,
      false,
    ]);
  });
});
