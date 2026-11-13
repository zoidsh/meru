import { describe, expect, it } from "vitest";

import { panes } from "../../../core/engines/layout.ts";
import { validateState } from "../../../core/engines/state.ts";
import type { Placement } from "../../../core/engines/state.ts";
import { AppEvents } from "../../../core/events.ts";
import type { AppEventMap } from "../../../core/events.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import { PROFILE_COLORS } from "../../../core/records/profile.ts";
import { profilesStateSchema } from "../../../core/records/profiles-state.ts";
import type { ProfilesState } from "../../../core/records/profiles-state.ts";
import type { Result } from "../../../core/result.ts";
import {
  profiles as profileChannels,
  tabs as tabChannels,
  profilesSnapshotSchema,
} from "../../../shared/channels/profiles.ts";
import { FakeClock } from "../../../test/fakes/clock.ts";
import { FakeFs } from "../../../test/fakes/fs.ts";
import { fakeIds } from "../../../test/fakes/ids.ts";
import { FakeLifecycle } from "../../../test/fakes/lifecycle.ts";
import { FakeRegistrar } from "../../../test/fakes/registrar.ts";
import { FakeSessions } from "../../../test/fakes/session.ts";
import { SettingsStore } from "../settings/index.ts";
import { FIRST_PROFILE_LABEL, Profiles, PROFILES_FILE } from "./index.ts";

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
  const registrar = new FakeRegistrar();
  const events = new AppEvents();
  const sessions = new FakeSessions();
  const settings = new SettingsStore({
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
  const profiles = new Profiles({
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
  };
};

const unwrap = <T>(
  result: { ok: true; value: T } | { ok: false; error: unknown }
): T => {
  if (!result.ok) {
    throw new Error(`Expected success, got ${String(result.error)}`);
  }
  return result.value;
};

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

  it("deactivates the profiles past the free count when the trial ends, keeping them and moving the selection", async () => {
    const { profiles, events, registrar } = await setup();
    const created = unwrap(profiles.createProfile("Work"));
    unwrap(profiles.selectProfile(created.id));
    registrar.call(profileChannels.snapshot, {}, PAGE);
    events.emit("entitlement.changed", { entitlement: free, reason: null });
    const pushed = profilesSnapshotSchema.parse(
      registrar.pushes.at(-1)?.payload
    );
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

  it("keeps a profile's last Gmail tab, and closes any other tab", async () => {
    const { profiles } = await setup();
    const [gmail] = profiles.state.tabs;
    const calendar = unwrap(
      profiles.addTab(profiles.selected().id, "calendar")
    );
    expect(profiles.closeTab(gmail?.id ?? "")).toStrictEqual({
      error: "required",
      ok: false,
    });
    unwrap(profiles.closeTab(calendar.id));
    expect(profiles.addTab(profiles.selected().id, "nothing")).toStrictEqual({
      error: "unknownApp",
      ok: false,
    });
  });

  it("answers its channels and pushes each change to the pages that asked", async () => {
    const { registrar, profiles } = await setup();
    const seed = profilesSnapshotSchema.parse(
      unwrap(registrar.call(profileChannels.snapshot, {}, PAGE))
    );
    expect(seed.profiles).toHaveLength(1);
    const added = unwrap(
      registrar.call(
        tabChannels.add,
        { appId: "drive", profileId: profiles.selected().id },
        PAGE
      )
    );
    expect(added).toMatchObject({ appId: "drive" });
    expect(
      registrar.call(profileChannels.create, { label: "Work" }, PAGE)
    ).toMatchObject({ ok: true });
    expect(
      registrar.pushes.map((pushed) => [pushed.channel, pushed.contentsId])
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
    expect(validateState(mended.profiles.state)).toStrictEqual([]);
    expect(mended.reports).toStrictEqual([]);
  });
});

// Deterministic, so a failing seed fails the same way on every run.
const random = (seed: number) => {
  let state = seed;
  return (below: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return below === 0 ? 0 : state % below;
  };
};

interface Choice {
  readonly profileId: string;
  readonly tabId: string;
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
  (profiles, { tabId, placement }) => profiles.splitInto(tabId, placement),
  (profiles, { tabId }) => profiles.leaveGroup(tabId),
  (profiles, { profileId, appId, placement }) =>
    profiles.addTab(profileId, appId, placement),
  (profiles, { tabId, placement }) =>
    profiles.createGroup([tabId, placement.paneId], placement.orientation),
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
      paneId: any(panes(group?.layout ?? null))?.paneId ?? "",
    },
    profileId:
      (pick(4) === 0 ? group?.profileId : any(state.profiles)?.id) ?? "",
    tabId: any(state.tabs)?.id ?? "",
  };
};

describe("the profiles' invariants", () => {
  it.each(Array.from({ length: 30 }, (_, index) => index + 1))(
    "hold after every one of a run of random operations (seed %i)",
    async (seed) => {
      const { profiles, errors } = await setup();
      const pick = random(seed);
      let changed = 0;
      for (let step = 0; step < 80; step += 1) {
        const operation = operations[pick(operations.length)];
        if (operation?.(profiles, choose(profiles.state, pick)).ok === true) {
          changed += 1;
        }
        expect(validateState(profiles.state)).toStrictEqual([]);
      }
      expect({ errors, mostlyChanged: changed > 20 }).toStrictEqual({
        errors: [],
        mostlyChanged: true,
      });
    }
  );
});
