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
      update({ key: "unifiedInbox", value: true }),
    ]).toStrictEqual([true, true, true, true]);
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
      update({ key: "notificationSoundVolume", value: 0.5 }),
      update({ key: "trayIcon", value: false }),
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
    ]);
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

  it("sends the page's settings, and only them", () => {
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
      unifiedInbox: true,
    };

    expect([
      settings.safeParse(values).success,
      Object.keys(settings.parse({ ...values, trayIcon: true })).toSorted(),
    ]).toStrictEqual([true, Object.keys(values).toSorted()]);
  });
});
