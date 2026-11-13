import { describe, expect, it } from "vitest";

import { panes } from "../../../core/engines/layout.ts";
import { validateState } from "../../../core/engines/state-validate.ts";
import { FIRST_PROFILE_LABEL } from "../../../core/engines/state.ts";
import { AppEvents } from "../../../core/events.ts";
import type { AppEventMap } from "../../../core/events.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import type { Beside, Placement } from "../../../core/records/layout.ts";
import { PROFILE_COLORS } from "../../../core/records/profile.ts";
import { profilesStateSchema } from "../../../core/records/profiles-state.ts";
import type { ProfilesState } from "../../../core/records/profiles-state.ts";
import type { Result } from "../../../core/result.ts";
import { isSingleInstanceId } from "../../../shared/apps.ts";
import { wireName } from "../../../shared/channels/define.ts";
import {
  profiles as profileChannels,
  tabs as tabChannels,
  profilesSnapshotSchema,
} from "../../../shared/channels/profiles.ts";
import { chromeSurface } from "../../../shared/channels/surfaces.ts";
import type { CommandId } from "../../../shared/commands/registry.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeIpcTransport } from "../../../test/fakes/ipc-transport.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { random } from "../../../test/random.ts";
import { unwrap } from "../../../test/result.ts";
import { CommandDispatcher } from "../../shell/commands.ts";
import { IpcDispatcher } from "../../shell/ipc.ts";
import { SettingsStore } from "../settings/index.ts";
import { Profiles, PROFILES_FILE } from "./index.ts";

const NOW = 1_800_000_000_000;
const PAGE = 7;
const facts = { expiresAt: NOW + 3_600_000, source: "stored" } as const;
const trial: Entitlement = {
  ...facts,
  endsAt: NOW + 86_400_000,
  kind: "trial",
};
const free: Entitlement = { ...facts, kind: "free" };
const ended: Entitlement = { ...facts, endsAt: NOW - 1, kind: "trial" };

const setup = async ({
  entitlement = trial,
  fs = new FakeFs(),
}: { entitlement?: Entitlement; fs?: FakeFs } = {}) => {
  const clock = new FakeClock(NOW);
  const lifecycle = new FakeLifecycle();
  const transport = new FakeIpcTransport();
  const registrar = new IpcDispatcher({
    onError: (error) => {
      throw error;
    },
    transport,
  });
  registrar.assign(PAGE, chromeSurface);
  const events = new AppEvents();
  const sessions = new FakeSessions();
  const settings = new SettingsStore({
    entitlement: () => ({ expiresAt: null, kind: "unknown", source: "stored" }),
    events: new AppEvents(),
    lifecycle,
    clock,
    fs,
    onError: (error) => {
      throw error;
    },
    onFallback: () => {
      throw new Error("Nothing was written, so nothing falls back");
    },
    registrar,
    watchFile: false,
  });
  await settings.open();
  const selected: AppEventMap["profile.selected"][] = [];
  events.on("profile.selected", (payload) => {
    selected.push(payload);
  });
  const errors: unknown[] = [];
  const reports: string[] = [];
  const commands = new CommandDispatcher();
  const profiles = new Profiles({
    commands,
    lifecycle,
    clock,
    entitlement,
    events,
    fs,
    ids: fakeIds("id"),
    onError: (error) => {
      errors.push(error);
    },
    registrar,
    report: (message) => {
      reports.push(message);
    },
    sessions,
    settings,
  });
  const opened = await profiles.open();
  profiles.start();
  const stored = async (): Promise<ProfilesState> => {
    await profiles.flush();
    const text = fs.files.get(PROFILES_FILE) ?? "null";
    const parsed: unknown = JSON.parse(text);
    return profilesStateSchema.parse(
      typeof parsed === "object" && parsed !== null && "data" in parsed
        ? parsed.data
        : parsed
    );
  };
  return {
    commands,
    errors,
    events,
    fs,
    opened,
    profiles,
    registrar,
    reports,
    selected,
    sessions,
    settings,
    stored,
    transport,
  };
};

const VERTICAL_AFTER: Beside = { orientation: "vertical", side: "after" };

describe(Profiles, () => {
  it("starts a fresh install with one profile holding one Gmail tab in a group of one, selected and written", async () => {
    const { profiles, opened, stored, errors } = await setup();
    const { state } = profiles;
    const [profile] = state.profiles;
    expect(opened.source).toBe("missing");
    expect(profile).toMatchObject({ label: FIRST_PROFILE_LABEL, order: 0 });
    expect(PROFILE_COLORS).toContain(profile?.color);
    expect({
      groups: state.groups.map((group) => group.tabIds),
      selected: state.selectedProfileId,
      tabs: state.tabs.map((tab) => [tab.appId, tab.profileId, tab.url]),
    }).toStrictEqual({
      groups: [state.tabs.map((tab) => tab.id)],
      selected: profile?.id,
      tabs: [["gmail", profile?.id, "https://mail.google.com/"]],
    });
    expect({ errors, stored: await stored() }).toStrictEqual({
      errors: [],
      stored: state,
    });
  });

  it("reads back what it wrote", async () => {
    const first = await setup();
    const created = unwrap(first.profiles.createProfile("Work", "#123456"));
    unwrap(first.profiles.addTab(created.id, "calendar"));
    unwrap(first.profiles.selectProfile(created.id));
    await first.profiles.flush();
    const second = await setup({ fs: first.fs });
    expect(second.opened.source).toBe("file");
    expect(second.profiles.state).toStrictEqual(first.profiles.state);
  });

  it("creates a profile with a Gmail tab, and removes it with its settings and session", async () => {
    const { profiles, settings, sessions } = await setup();
    const created = unwrap(profiles.createProfile("Work"));
    expect(created).toMatchObject({ label: "Work", order: 1 });
    expect(
      profiles.state.tabs
        .filter((tab) => tab.profileId === created.id)
        .map((tab) => tab.appId)
    ).toStrictEqual(["gmail"]);
    settings.set("stage.zoom", 2, created.id);
    unwrap(profiles.removeProfile(created.id));
    await Promise.resolve();
    expect({
      cleared: sessions.cleared,
      layers: Object.keys(settings.settings.profiles),
      profiles: profiles.state.profiles.length,
      tabs: profiles.state.tabs.some((tab) => tab.profileId === created.id),
    }).toStrictEqual({
      cleared: [`persist:${created.id}`],
      layers: [],
      profiles: 1,
      tabs: false,
    });
    expect(profiles.removeProfile(profiles.selected().id)).toStrictEqual({
      error: "lastProfile",
      ok: false,
    });
  });

  it("renames a profile and changes its colour on a page's request, and refuses an empty label", async () => {
    const { profiles, registrar } = await setup();
    const created = unwrap(profiles.createProfile("Work"));
    const update = (payload: object) =>
      registrar.dispatch(PAGE, wireName(profileChannels.update), payload);
    const renamed = update({
      color: "#123456",
      label: "Office",
      profileId: created.id,
    });
    const empty = update({ label: "", profileId: created.id });
    expect({
      empty: empty.ok,
      profile: profiles.state.profiles.find((found) => found.id === created.id),
      renamed,
    }).toStrictEqual({
      empty: false,
      profile: { ...created, color: "#123456", label: "Office" },
      renamed: { ok: true, value: null },
    });
  });

  it("selects a profile, telling whoever listens which group it shows, and moves the selection off a removed one", async () => {
    const { profiles, selected } = await setup();
    const first = profiles.selected();
    const created = unwrap(profiles.createProfile("Work"));
    const createdGroup = profiles.currentGroup(created.id)?.id;
    unwrap(profiles.selectProfile(created.id));
    unwrap(profiles.removeProfile(created.id));
    expect(selected).toStrictEqual([
      { groupId: createdGroup, profileId: created.id },
      { groupId: profiles.currentGroup(first.id)?.id, profileId: first.id },
    ]);
    expect(profiles.selectProfile("missing")).toStrictEqual({
      error: "unknownProfile",
      ok: false,
    });
  });

  it.each([
    [free, "free"],
    [ended, "trialEnded"],
  ] as const)(
    "refuses a second profile under %o with the gate's reason",
    async (entitlement, reason) => {
      const { profiles } = await setup({ entitlement });
      expect(profiles.createProfile("Work")).toStrictEqual({
        error: reason,
        ok: false,
      });
      expect(profiles.state.profiles).toHaveLength(1);
    }
  );

  it("refuses a second profile once the entitlement changes to free", async () => {
    const { profiles, events } = await setup();
    events.emit("entitlement.changed", { entitlement: free });
    expect(profiles.createProfile("Work")).toStrictEqual({
      error: "free",
      ok: false,
    });
  });

  it("deactivates the profiles past the free count when the trial ends, keeping them and moving the selection", async () => {
    const { profiles, events, registrar, transport } = await setup();
    const created = unwrap(profiles.createProfile("Work"));
    unwrap(profiles.selectProfile(created.id));
    registrar.dispatch(PAGE, wireName(profileChannels.snapshot), {});
    events.emit("entitlement.changed", { entitlement: free });
    const pushed = profilesSnapshotSchema.parse(transport.sent.at(-1)?.payload);
    expect(
      pushed.profiles.map((profile) => [profile.label, profile.deactivated])
    ).toStrictEqual([
      [FIRST_PROFILE_LABEL, false],
      ["Work", true],
    ]);
    expect(pushed.selectedProfileId).not.toBe(created.id);
    expect(profiles.selectProfile(created.id)).toStrictEqual({
      error: "deactivated",
      ok: false,
    });
  });

  it("selects a profile by its place in the titlebar and steps through them, wrapping, past the deactivated ones", async () => {
    const { profiles, commands, events } = await setup();
    const work = unwrap(profiles.createProfile("Work"));
    const home = unwrap(profiles.createProfile("Home"));
    const first = profiles.selected().id;
    const visit = (ids: readonly CommandId[]) =>
      ids.map((id) => {
        commands.run(id, { windowId: 1 });
        return profiles.selected().id;
      });
    expect(
      visit([
        "profiles.select2",
        "profiles.next",
        "profiles.next",
        "profiles.previous",
        "profiles.select4",
      ])
    ).toStrictEqual([work.id, home.id, first, home.id, home.id]);
    expect(commands.enabled("profiles.select4")).toBeFalsy();

    events.emit("entitlement.changed", { entitlement: free });
    expect(profiles.selected().id).toBe(first);
    expect([
      commands.enabled("profiles.select2"),
      commands.enabled("profiles.next"),
    ]).toStrictEqual([false, false]);
  });

  it("brings a tab of another profile to the front, selecting its profile and telling whoever shows it", async () => {
    const { profiles, events, registrar } = await setup();
    const work = unwrap(profiles.createProfile("Work"));
    const calendar = unwrap(profiles.addTab(work.id, "calendar"));
    const focused: AppEventMap["tab.focused"][] = [];
    events.on("tab.focused", (payload) => {
      focused.push(payload);
    });
    expect(
      registrar.dispatch(PAGE, wireName(tabChannels.focus), {
        tabId: calendar.id,
      })
    ).toStrictEqual({ ok: true, value: null });
    expect(profiles.selected().id).toBe(work.id);
    expect(focused).toStrictEqual([
      {
        groupId: profiles.state.groups.find((group) =>
          group.tabIds.includes(calendar.id)
        )?.id,
        tabId: calendar.id,
      },
    ]);
  });

  it("joins a tab into another's group beside its pane, out of its own group first, and leaves it again at a row below the pinned Gmail", async () => {
    const { profiles } = await setup();
    const profileId = profiles.selected().id;
    const [gmail] = profiles.state.tabs;
    const calendar = unwrap(profiles.addTab(profileId, "calendar"));
    const drive = unwrap(profiles.addTab(profileId, "drive"));
    const groupOfTab = (tabId: string) =>
      profiles.state.groups.find((group) => group.tabIds.includes(tabId));
    unwrap(profiles.joinTab(drive.id, calendar.id, VERTICAL_AFTER));
    expect(groupOfTab(drive.id)?.tabIds).toStrictEqual([calendar.id, drive.id]);
    expect(groupOfTab(drive.id)?.layout).toMatchObject({
      kind: "split",
      orientation: "vertical",
    });
    unwrap(profiles.joinTab(drive.id, gmail?.id ?? "", VERTICAL_AFTER));
    expect(groupOfTab(calendar.id)?.tabIds).toStrictEqual([calendar.id]);
    expect(groupOfTab(drive.id)?.tabIds).toStrictEqual([gmail?.id, drive.id]);
    unwrap(profiles.leaveGroup(drive.id, 0));
    expect(
      profiles.state.tabs.map((tab) => [
        tab.appId,
        groupOfTab(tab.id)?.tabIds.length,
      ])
    ).toStrictEqual([
      ["gmail", 1],
      ["drive", 1],
      ["calendar", 1],
    ]);
  });

  it("keeps a profile's last Gmail tab, says so in the snapshot, and closes any other tab", async () => {
    const { profiles } = await setup();
    const [gmail] = profiles.state.tabs;
    const calendar = unwrap(
      profiles.addTab(profiles.selected().id, "calendar")
    );
    expect(
      profiles.snapshot().tabs.map((tab) => [tab.appId, tab.closeable])
    ).toStrictEqual([
      ["gmail", false],
      ["calendar", true],
    ]);
    expect(profiles.closeTab(gmail?.id ?? "")).toStrictEqual({
      error: "pinned",
      ok: false,
    });
    unwrap(profiles.closeTab(calendar.id));
    expect(profiles.addTab(profiles.selected().id, "nothing")).toStrictEqual({
      error: "unknownApp",
      ok: false,
    });
  });

  it("answers its channels and pushes each change to every page", async () => {
    const { registrar, profiles, transport } = await setup();
    const seed = profilesSnapshotSchema.parse(
      unwrap(registrar.dispatch(PAGE, wireName(profileChannels.snapshot), {}))
    );
    expect(seed.profiles).toHaveLength(1);
    const added = unwrap(
      registrar.dispatch(PAGE, wireName(tabChannels.add), {
        appId: "drive",
        profileId: profiles.selected().id,
      })
    );
    expect(added).toMatchObject({ appId: "drive" });
    expect(
      registrar.dispatch(PAGE, wireName(profileChannels.create), {
        label: "Work",
      })
    ).toMatchObject({ ok: true });
    expect(
      transport.sent.map((pushed) => [pushed.channel, pushed.contentsId])
    ).toStrictEqual([
      ["profiles.changed", PAGE],
      ["profiles.changed", PAGE],
    ]);
  });

  it("starts over from one profile when the file is corrupt, and mends a file that half holds", async () => {
    const corrupt = await setup({
      fs: new FakeFs({ [PROFILES_FILE]: "{ half" }),
    });
    expect(
      corrupt.profiles.state.profiles.map((profile) => profile.label)
    ).toStrictEqual([FIRST_PROFILE_LABEL]);
    const fresh = await setup();
    const { state } = fresh.profiles;
    const mended = await setup({
      fs: new FakeFs({
        [PROFILES_FILE]: JSON.stringify({
          data: { ...state, groups: [] },
          version: 1,
        }),
      }),
    });
    expect(
      validateState(mended.profiles.state, isSingleInstanceId)
    ).toStrictEqual([]);
    expect(mended.reports).toStrictEqual([]);
  });
});

interface Choice {
  readonly profileId: string;
  readonly tabId: string;
  readonly targetTabId: string;
  readonly placement: Placement;
  readonly appId: string;
  readonly index: number;
}

const operations: readonly ((
  profiles: Profiles,
  choice: Choice
) => Result<unknown, string>)[] = [
  (profiles, { profileId }) => profiles.createProfile(profileId),
  (profiles, { profileId }) => profiles.removeProfile(profileId),
  (profiles, { profileId }) => profiles.selectProfile(profileId),
  (profiles, { profileId, appId }) => profiles.addTab(profileId, appId),
  (profiles, { tabId }) => profiles.closeTab(tabId),
  (profiles, { tabId, index }) => profiles.moveTab(tabId, index),
  (profiles, { tabId, targetTabId, placement }) =>
    profiles.joinTab(tabId, targetTabId, placement),
  (profiles, { tabId, index }) => profiles.leaveGroup(tabId, index),
  (profiles, { profileId, appId, placement }) =>
    profiles.addTab(profileId, appId, placement),
];

const choose = (
  state: ProfilesState,
  pick: (below: number) => number
): Choice => {
  const any = <T>(items: readonly T[]): T | undefined =>
    items[pick(items.length)];
  const group = any(state.groups);
  return {
    appId: any(["gmail", "calendar", "drive"]) ?? "gmail",
    index: pick(8) - 2,
    placement: {
      groupId: group?.id ?? "",
      orientation: pick(2) === 0 ? "vertical" : "horizontal",
      side: pick(2) === 0 ? "before" : "after",
      paneId: any(panes(group?.layout ?? null))?.paneId ?? "",
    },
    profileId:
      (pick(4) === 0 ? group?.profileId : any(state.profiles)?.id) ?? "",
    tabId: any(state.tabs)?.id ?? "",
    targetTabId: any(state.tabs)?.id ?? "",
  };
};

describe("the profiles' invariants", () => {
  it.each(Array.from({ length: 30 }, (_, index) => index + 1))(
    "hold after every one of a run of random operations (seed %i)",
    async (seed) => {
      const { profiles, errors } = await setup();
      const draw = random(seed);
      const pick = (below: number) => Math.floor(draw() * below);
      let changed = 0;
      for (let step = 0; step < 80; step += 1) {
        const operation = operations[pick(operations.length)];
        if (operation?.(profiles, choose(profiles.state, pick)).ok === true) {
          changed += 1;
        }
        expect(validateState(profiles.state, isSingleInstanceId)).toStrictEqual(
          []
        );
      }
      expect({ errors, mostlyChanged: changed > 20 }).toStrictEqual({
        errors: [],
        mostlyChanged: true,
      });
    }
  );
});
