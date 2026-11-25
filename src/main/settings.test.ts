import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { Settings } from "#core/settings.ts";
import { newProfile } from "#core/state.ts";
import { fakeTextFile } from "#platform/text-file.fake.ts";
import type { TextFile } from "#platform/text-file.ts";

import { StartupError } from "./failures.ts";
import { createProfiles } from "./profiles.ts";
import {
  createSettingsStore,
  followRemovedProfiles,
  openSettings,
} from "./settings.ts";

const SETTINGS_PATH = path.join("/data", "Meru Dev", "settings.json");

const createFakeFile = (contents?: string) => {
  const files = new Map<string, string>(
    contents === undefined ? [] : [[SETTINGS_PATH, contents]]
  );

  return { file: fakeTextFile(SETTINGS_PATH, files), files };
};

const load = async (file: TextFile) => {
  const opened = await openSettings({
    file,
    now: () => 1_763_290_000_000,
    log: () => {},
  });

  await opened.settle();

  return opened.value;
};

describe(openSettings, () => {
  it("touches nothing on disk until it settles", async () => {
    const { file, files } = createFakeFile("{ not json");

    await openSettings({ file, now: () => 1, log: () => {} });

    expect([...files]).toStrictEqual([[SETTINGS_PATH, "{ not json"]]);
  });

  it("starts and saves an empty file when there is none", async () => {
    const { file, files } = createFakeFile();

    await expect(load(file)).resolves.toStrictEqual({ version: 1 });
    expect(JSON.parse(files.get(SETTINGS_PATH) ?? "")).toStrictEqual({
      version: 1,
    });
  });

  it("keeps a file it cannot read aside and starts afresh", async () => {
    const { file, files } = createFakeFile("{ not json");

    await expect(load(file)).resolves.toStrictEqual({ version: 1 });
    expect(
      files.get(
        path.join("/data", "Meru Dev", "settings.corrupt-1763290000000.json")
      )
    ).toBe("{ not json");
  });

  it("stops startup on a newer file and touches nothing", async () => {
    const text = JSON.stringify({ version: 2 });
    const { file, files } = createFakeFile(text);

    await expect(load(file)).rejects.toBeInstanceOf(StartupError);
    expect([...files]).toStrictEqual([[SETTINGS_PATH, text]]);
  });
});

const setup = (initial: Settings, failSave = false) => {
  const saved: unknown[] = [];
  const settings = createSettingsStore({
    initial,
    save: (next) => {
      if (failSave) {
        return Promise.reject(new Error("disk full"));
      }

      saved.push(structuredClone(next));

      return Promise.resolve();
    },
    platform: "darwin",
    log: () => {},
  });

  return { settings, saved };
};

describe(createSettingsStore, () => {
  it("keeps the design and vibrancy an earlier build wrote when another setting changes", async () => {
    const found = { version: 1, design: "classic", vibrancy: false };
    const { file } = createFakeFile(JSON.stringify(found));
    const { settings, saved } = setup(await load(file));

    await settings.update("unreadBadge", () => false);

    expect(saved).toStrictEqual([{ ...found, unreadBadge: false }]);
  });

  it("keeps the Hide Gmail logo an earlier build wrote, app-wide and in a profile, when settings change", async () => {
    const found = {
      version: 1,
      hideGmailLogo: false,
      profiles: { p: { hideGmailLogo: true, unreadBadge: false } },
    };
    const { file } = createFakeFile(JSON.stringify(found));
    const { settings, saved } = setup(await load(file));

    expect(settings.get("unreadBadge", "p")).toBeFalsy();

    await settings.update("hidePromoBanner", () => false);
    await settings.setOverride("p", "notifications", false);
    await settings.clearOverride("p", "unreadBadge");

    expect(saved.at(-1)).toStrictEqual({
      version: 1,
      hideGmailLogo: false,
      hidePromoBanner: false,
      profiles: { p: { hideGmailLogo: true, notifications: false } },
    });
  });

  it("saves a change before it reads back, and keeps the rest of the file as found", async () => {
    const { settings, saved } = setup({
      version: 1,
      trayIconColor: "glass",
      later: 1,
    });

    expect(settings.get("trayIconColor")).toBe("system");

    await settings.update("unreadBadge", () => false);

    expect(settings.get("unreadBadge")).toBeFalsy();
    expect(saved).toStrictEqual([
      { version: 1, trayIconColor: "glass", later: 1, unreadBadge: false },
    ]);
  });

  it("announces a change to that key's listeners alone, and nothing when the value stays", async () => {
    const { settings } = setup({ version: 1 });
    const heard: string[] = [];

    settings.onChange("trayIconColor", () =>
      heard.push(settings.get("trayIconColor"))
    );
    settings.onChange("unreadBadge", () => heard.push("unreadBadge"));

    await settings.update("trayIconColor", () => "dark");
    await settings.update("trayIconColor", () => "dark");
    await settings.update("trayIconColor", () => "system");

    expect(heard).toStrictEqual(["dark", "system"]);
  });

  it("announces nothing for setting a value that did not parse to its default", async () => {
    const { settings, saved } = setup({ version: 1, trayIconColor: "glass" });
    const heard: string[] = [];

    settings.onChange("trayIconColor", () => heard.push("trayIconColor"));
    await settings.update("trayIconColor", () => "system");

    expect(heard).toStrictEqual([]);
    expect(saved).toStrictEqual([{ version: 1, trayIconColor: "system" }]);
  });

  it("leaves the old value standing when the save fails", async () => {
    const { settings } = setup({ version: 1 }, true);
    const heard: string[] = [];

    settings.onChange("trayIconColor", () => heard.push("trayIconColor"));

    await expect(
      settings.update("trayIconColor", () => "dark")
    ).rejects.toThrow("disk full");
    expect(settings.get("trayIconColor")).toBe("system");
    expect(heard).toStrictEqual([]);
  });

  it("reads a profile's own value, and writes it without touching the app value", async () => {
    const { settings, saved } = setup({ version: 1, later: 1 });
    const read = () => [
      settings.get("notifications"),
      settings.get("notifications", "p"),
      settings.get("notifications", "q"),
    ];

    await settings.setOverride("p", "notifications", false);

    expect(read()).toStrictEqual([true, false, true]);

    await settings.update("notifications", () => false);
    await settings.setOverride("p", "notifications", true);

    expect(read()).toStrictEqual([false, true, false]);
    expect(settings.overridingProfiles("notifications")).toStrictEqual(["p"]);

    await settings.clearOverride("p", "notifications");

    expect(read()).toStrictEqual([false, false, false]);
    expect(saved.at(-1)).toStrictEqual({
      version: 1,
      later: 1,
      notifications: false,
    });
  });

  it("announces a key when a profile's value of it changes, or whether the profile holds one, and not otherwise", async () => {
    const { settings } = setup({
      version: 1,
      profiles: { p: { unreadBadge: false } },
    });
    const heard: string[] = [];
    let step = "";

    settings.onChange("unreadBadge", () => heard.push(`unreadBadge ${step}`));
    settings.onChange("notifications", () =>
      heard.push(`notifications ${step}`)
    );

    const run = async (name: string, change: () => Promise<void>) => {
      step = name;
      await change();
    };

    await run("q's own", () => settings.setOverride("q", "unreadBadge", false));
    await run("r's own, equal to the app's", () =>
      settings.setOverride("r", "unreadBadge", true)
    );
    await run("p's again", () =>
      settings.setOverride("p", "unreadBadge", false)
    );
    await run("the app's", () => settings.update("unreadBadge", () => false));
    await run("q's cleared, equal to the app's", () =>
      settings.clearOverride("q", "unreadBadge")
    );
    await run("q's cleared again", () =>
      settings.clearOverride("q", "unreadBadge")
    );
    await run("r removed", () => settings.removeProfile("r"));

    expect(heard).toStrictEqual([
      "unreadBadge q's own",
      "unreadBadge r's own, equal to the app's",
      "unreadBadge the app's",
      "unreadBadge q's cleared, equal to the app's",
      "unreadBadge r removed",
    ]);
  });

  it("deletes a profile's entry on its removal, keeping the rest of the file", async () => {
    const { settings, saved } = setup({
      version: 1,
      later: 1,
      profiles: { p: { notifications: false, later: 2 }, q: "odd" },
    });
    const heard: string[] = [];

    settings.onChange("notifications", () => heard.push("notifications"));
    await settings.removeProfile("p");

    expect(saved).toStrictEqual([
      { version: 1, later: 1, profiles: { q: "odd" } },
    ]);
    expect(heard).toStrictEqual(["notifications"]);
  });

  it("reads every profile's own value as unset while they do not apply, keeps each stored through writes, and announces them once they do", async () => {
    let apply = false;
    const saved: unknown[] = [];
    const settings = createSettingsStore({
      initial: {
        version: 1,
        profiles: { a: { notifications: false }, b: { unreadBadge: false } },
      },
      save: (next) => {
        saved.push(structuredClone(next));

        return Promise.resolve();
      },
      platform: "darwin",
      log: () => {},
      profileValues: () => apply,
    });
    const heard: string[] = [];

    settings.onChange("notifications", () => heard.push("notifications"));
    settings.onChange("tray", () => heard.push("tray"));

    const read = () => [
      settings.get("notifications", "a"),
      settings.get("unreadBadge", "b"),
      settings.overridingProfiles("notifications"),
    ];

    expect(read()).toStrictEqual([true, true, []]);

    await settings.update("tray", () => true);
    await settings.setOverride("a", "notificationSender", false);

    expect(saved.at(-1)).toStrictEqual({
      version: 1,
      tray: true,
      profiles: {
        a: { notifications: false, notificationSender: false },
        b: { unreadBadge: false },
      },
    });

    heard.length = 0;
    settings.recheck();

    expect(heard).toStrictEqual([]);

    apply = true;
    settings.recheck();

    expect(heard).toStrictEqual(["notifications"]);
    expect(read()).toStrictEqual([false, false, ["a"]]);
  });

  it("reads a gated setting as its free value without its capability, refuses to write it, keeps it stored, and announces it once granted", async () => {
    let granted = false;
    const saved: unknown[] = [];
    const initial = {
      version: 1,
      titlebarUnifiedInbox: true,
      unifiedInbox: true,
    };
    const settings = createSettingsStore({
      initial,
      save: (next) => {
        saved.push(structuredClone(next));

        return Promise.resolve();
      },
      platform: "darwin",
      log: () => {},
      can: (capability) => granted || capability === "profiles",
    });
    const heard: string[] = [];

    settings.onChange("titlebarUnifiedInbox", () =>
      heard.push("titlebarUnifiedInbox")
    );
    settings.onChange("tray", () => heard.push("tray"));

    const read = () => [
      settings.get("titlebarUnifiedInbox"),
      settings.get("unifiedInbox", "a"),
    ];
    const free = read();
    const refused = await Promise.allSettled([
      settings.update("titlebarUnifiedInbox", () => false),
      settings.setOverride("a", "unifiedInbox", false),
      settings.clearOverride("a", "unifiedInbox"),
    ]);

    settings.recheck();

    const heardWhileFree = [...heard];

    granted = true;
    settings.recheck();

    expect([
      free,
      refused.map((result) => result.status),
      saved,
      heardWhileFree,
      heard,
      read(),
    ]).toStrictEqual([
      [false, false],
      ["rejected", "rejected", "rejected"],
      [],
      [],
      ["titlebarUnifiedInbox"],
      [true, true],
    ]);
  });

  it("tells a listener of several gated keys once when a license arrives, not once per key", () => {
    let licensed = false;
    const settings = createSettingsStore({
      initial: { version: 1 },
      save: () => Promise.resolve(),
      platform: "darwin",
      log: () => {},
      can: () => licensed,
    });
    let pushes = 0;
    const push = () => {
      pushes += 1;
    };

    for (const key of [
      "hidePromoBanner",
      "hideUpgradeButton",
      "extendDarkTheme",
      "reverseConversation",
      "moveAttachmentsToTop",
      "showTrimmedContent",
    ] as const) {
      settings.onChange(key, push);
    }

    licensed = true;
    settings.recheck();

    expect(pushes).toBe(1);
  });

  it("writes an ungated setting changed without Meru Pro with every gated one as stored, not as read", async () => {
    const saved: Record<string, unknown>[] = [];
    const gated = {
      unifiedInbox: true,
      titlebarDoNotDisturb: true,
      quietHours: [{ start: "22:00", end: "07:00" }],
      notificationImportantOnly: true,
      verificationCodes: true,
      verificationCodeTrash: true,
      notificationSound: "system",
    };
    const settings = createSettingsStore({
      initial: { version: 1, ...gated },
      save: (next) => {
        saved.push(structuredClone(next) as Record<string, unknown>);

        return Promise.resolve();
      },
      platform: "darwin",
      log: () => {},
      can: () => false,
    });

    await settings.update("notificationSoundVolume", () => 0.2);

    expect(saved).toStrictEqual([
      expect.objectContaining({ ...gated, notificationSoundVolume: 0.2 }),
    ]);
  });
});

describe(followRemovedProfiles, () => {
  it("deletes a removed profile's overrides from the file once its removal is committed", async () => {
    const { settings, saved } = setup({
      version: 1,
      profiles: { a: { unreadBadge: false }, b: { notifications: false } },
    });
    const profiles = createProfiles({
      initial: {
        version: 1,
        profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
        selectedProfileId: "a",
      },
      save: () => Promise.resolve(),
      newId: () => "c",
      profileName: (n) => `Profile ${n}`,
      clearSession: () => Promise.resolve(),
      now: () => 0,
      log: () => {},
    });

    followRemovedProfiles({ settings, profiles, log: () => {} });
    await profiles.add();
    await profiles.remove("b");
    await vi.waitFor(() => {
      expect(saved).toHaveLength(1);
    });

    expect(saved).toStrictEqual([
      { version: 1, profiles: { a: { unreadBadge: false } } },
    ]);
  });

  it("keeps the overrides of a profile the run stops using, and of the one it uses through a write", async () => {
    const { settings, saved } = setup({
      version: 1,
      profiles: { a: { unreadBadge: false }, b: { notifications: false } },
    });
    let multiple = true;
    const profiles = createProfiles({
      initial: {
        version: 1,
        profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
        selectedProfileId: "b",
      },
      save: () => Promise.resolve(),
      newId: () => "c",
      profileName: (n) => `Profile ${n}`,
      clearSession: () => Promise.resolve(),
      now: () => 0,
      log: () => {},
      multipleProfiles: () => multiple,
    });

    followRemovedProfiles({ settings, profiles, log: () => {} });
    multiple = false;
    profiles.recheck();
    await profiles.rename("a", "Mine");
    await profiles.settled();

    expect(profiles.get().profiles).toHaveLength(1);
    expect(saved).toStrictEqual([]);
  });
});
