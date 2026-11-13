import { orderedProfiles } from "../../../core/engines/ordering.ts";
import {
  addProfile,
  addTab,
  closeTab,
  colorFor,
  createGroup,
  firstGroup,
  freshState,
  leaveGroup,
  moveTabTo,
  removeProfile,
  repairState,
  resizeSplit,
  selectProfile,
  setProfileStatus,
  splitInto,
  updateTab,
  validateState,
} from "../../../core/engines/state.ts";
import type {
  Placement,
  StateError,
  TabPatch,
} from "../../../core/engines/state.ts";
import { deactivatedProfiles, canUse } from "../../../core/entitlement/gate.ts";
import type { GateRefusal } from "../../../core/entitlement/gate.ts";
import type { AppEvents } from "../../../core/events.ts";
import type {
  AppPort,
  Clock,
  FsPort,
  Ids,
  SessionPort,
  Unsubscribe,
} from "../../../core/ports.ts";
import type { App } from "../../../core/records/app.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Orientation } from "../../../core/records/layout.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import type { Profile, ProfileStatus } from "../../../core/records/profile.ts";
import { profilesStateSchema } from "../../../core/records/profiles-state.ts";
import type { ProfilesState } from "../../../core/records/profiles-state.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import { SnapshotStore } from "../../../core/snapshot.ts";
import type { Opened, SnapshotSpec } from "../../../core/snapshot.ts";
import { appById, gmail } from "../../../shared/apps.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import {
  profiles as profileChannels,
  profilesPushes,
  tabs as tabChannels,
} from "../../../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../../../shared/profiles.ts";
import type { SettingsStore } from "../settings/index.ts";

export const PROFILES_FILE = "profiles.json";

export const FIRST_PROFILE_LABEL = "Personal";

export type ProfilesError =
  | StateError
  | GateRefusal
  | "unknownApp"
  /** The profile's last tab of a single-instance app, such as Gmail, stays. */
  | "required"
  /** The entitlement does not allow the profile now. */
  | "deactivated"
  /** The change would have broken an invariant of the state, which is a bug, reported. */
  | "invalid";

export const newTab = (ids: Ids, profileId: string, app: App): Tab => ({
  appId: app.id,
  health: "ok",
  id: ids(),
  pinned: false,
  profileId,
  sleeping: false,
  title: app.name,
  url: app.url,
  zoom: 1,
});

const newProfile = (
  ids: Ids,
  label: string,
  color?: string
): Omit<Profile, "order"> => {
  const id = ids();
  return { color: color ?? colorFor(id), id, label, status: { kind: "ok" } };
};

/** The state of a first launch: one profile with one Gmail tab, selected. */
export const firstState = (ids: Ids): ProfilesState => {
  const profile = newProfile(ids, FIRST_PROFILE_LABEL);
  return freshState(
    { ...profile, order: 0 },
    newTab(ids, profile.id, gmail),
    ids
  );
};

export const profilesSnapshot = (
  ids: Ids
): SnapshotSpec<ProfilesState, string> => ({
  migrations: [],
  name: PROFILES_FILE,
  recover: (data) => {
    if (data === undefined) {
      return { fallbacks: [], value: firstState(ids) };
    }
    const repaired = repairState(data, {
      fresh: () => firstState(ids),
      ids,
      tabFor: (profileId) => newTab(ids, profileId, gmail),
    });
    return { fallbacks: repaired.dropped, value: repaired.state };
  },
  schema: profilesStateSchema.superRefine((state, context) => {
    for (const message of validateState(state)) {
      context.addIssue({ code: "custom", message });
    }
  }),
  version: 1,
});

const done = (result: Result<undefined, ProfilesError>): Result<null, string> =>
  result.ok ? ok(null) : result;

export interface ProfilesOptions {
  readonly fs: FsPort;
  readonly clock: Clock;
  readonly app: Pick<AppPort, "onQuit">;
  readonly ids: Ids;
  readonly events: AppEvents;
  readonly registrar: IpcRegistrar;
  readonly sessions: SessionPort;
  readonly settings: Pick<SettingsStore, "removeProfile">;
  /** The entitlement at construction; later values arrive as `entitlement.changed`. */
  readonly entitlement: Entitlement;
  readonly report: (message: string) => void;
  readonly onError: (error: unknown) => void;
}

/** Owns profiles.json: every profile, tab and group, and which profile is selected. */
export class Profiles {
  readonly #options: ProfilesOptions;
  readonly #store: SnapshotStore<ProfilesState, string>;
  readonly #pages = new Set<number>();
  #entitlement: Entitlement;
  #state: ProfilesState | undefined;

  constructor(options: ProfilesOptions) {
    this.#options = options;
    this.#entitlement = options.entitlement;
    this.#store = new SnapshotStore(profilesSnapshot(options.ids), {
      app: options.app,
      clock: options.clock,
      fs: options.fs,
      onError: options.onError,
    });
  }

  async open(): Promise<Opened<ProfilesState, string>> {
    const opened = await this.#store.open();
    this.#state = opened.value;
    if (opened.fallbacks.length > 0) {
      this.#options.report(
        `${PROFILES_FILE}: dropped ${opened.fallbacks.join(", ")}`
      );
    }
    if (opened.source === "missing") {
      this.#store.write(opened.value);
    } else if (opened.source !== "file") {
      this.#options.report(
        `${PROFILES_FILE} is ${opened.source}, so the app starts with one profile`
      );
    }
    return opened;
  }

  start(): Unsubscribe {
    const { registrar, events } = this.#options;
    const removers = [
      registrar.register(profileChannels, {
        create: ({ label, color }) => this.createProfile(label, color),
        remove: ({ profileId }) => done(this.removeProfile(profileId)),
        select: ({ profileId }) => done(this.selectProfile(profileId)),
        snapshot: (_payload, { contentsId }) => {
          this.#pages.add(contentsId);
          return ok(this.snapshot());
        },
      }),
      registrar.register(tabChannels, {
        add: ({ profileId, appId }) => this.addTab(profileId, appId),
        close: ({ tabId }) => done(this.closeTab(tabId)),
        move: ({ tabId, to }) => done(this.moveTab(tabId, to)),
      }),
      events.on("entitlement.changed", ({ entitlement }) => {
        this.#entitlement = entitlement;
        this.#reselect();
        this.#publish();
      }),
    ];
    return () => {
      for (const remove of removers) {
        remove();
      }
      this.#store.dispose();
    };
  }

  get state(): ProfilesState {
    if (this.#state === undefined) {
      throw new Error("Profiles were read before open()");
    }
    return this.#state;
  }

  /** The profile the main window shows. */
  selected(): Profile {
    const { profiles, selectedProfileId } = this.state;
    const found =
      profiles.find((profile) => profile.id === selectedProfileId) ??
      orderedProfiles(profiles)[0];
    if (found === undefined) {
      throw new Error("The state holds no profile");
    }
    return found;
  }

  group(groupId: string): Group | undefined {
    return this.state.groups.find((group) => group.id === groupId);
  }

  tab(tabId: string): Tab | undefined {
    return this.state.tabs.find((tab) => tab.id === tabId);
  }

  /** The group a profile shows when it is selected: its first in sidebar order. */
  currentGroup(profileId = this.selected().id): Group | undefined {
    return firstGroup(this.state, profileId);
  }

  isDeactivated(profileId: string): boolean {
    return this.#deactivated().has(profileId);
  }

  snapshot(): ProfilesSnapshot {
    const deactivated = this.#deactivated();
    return {
      ...this.state,
      profiles: this.state.profiles.map((profile) => ({
        ...profile,
        deactivated: deactivated.has(profile.id),
      })),
    };
  }

  createProfile(label: string, color?: string): Result<Profile, ProfilesError> {
    const { ids, clock } = this.#options;
    const gate = canUse(this.#entitlement, "extraProfile", {
      now: clock.now(),
      profiles: this.state.profiles.length,
    });
    if (!gate.allowed) {
      return err(gate.reason);
    }
    const profile = newProfile(ids, label, color);
    const next = addProfile(
      this.state,
      profile,
      newTab(ids, profile.id, gmail),
      ids
    );
    const added = next.profiles.find((found) => found.id === profile.id);
    const committed = this.#commit(ok(next));
    return committed.ok && added !== undefined ? ok(added) : err("invalid");
  }

  /** Removes a profile with its tabs, its settings and its session. */
  removeProfile(profileId: string): Result<undefined, ProfilesError> {
    const committed = this.#commit(removeProfile(this.state, profileId));
    if (committed.ok) {
      this.#options.settings.removeProfile(profileId);
      void this.#clear(partitionOf(profileId));
    }
    return committed;
  }

  selectProfile(profileId: string): Result<undefined, ProfilesError> {
    if (this.isDeactivated(profileId)) {
      return err("deactivated");
    }
    return this.#commit(selectProfile(this.state, profileId));
  }

  setProfileStatus(
    profileId: string,
    status: ProfileStatus
  ): Result<undefined, ProfilesError> {
    return this.#commit(setProfileStatus(this.state, profileId, status));
  }

  /** Adds a tab of the app after the profile's others, in a group of its own or split into a group's pane. */
  addTab(
    profileId: string,
    appId: string,
    placement?: Placement
  ): Result<Tab, ProfilesError> {
    const app = appById(appId);
    if (app === undefined) {
      return err("unknownApp");
    }
    const tab = newTab(this.#options.ids, profileId, app);
    const committed = this.#commit(
      addTab(this.state, tab, this.#options.ids, placement)
    );
    return committed.ok ? ok(tab) : committed;
  }

  closeTab(tabId: string): Result<undefined, ProfilesError> {
    const tab = this.tab(tabId);
    if (tab !== undefined && appById(tab.appId)?.singleInstance === true) {
      const others = this.state.tabs.some(
        (found) =>
          found.id !== tabId &&
          found.profileId === tab.profileId &&
          found.appId === tab.appId
      );
      if (!others) {
        return err("required");
      }
    }
    return this.#commit(closeTab(this.state, tabId));
  }

  moveTab(tabId: string, to: number): Result<undefined, ProfilesError> {
    return this.#commit(moveTabTo(this.state, tabId, to));
  }

  setTabStatus(
    tabId: string,
    patch: TabPatch
  ): Result<undefined, ProfilesError> {
    return this.#commit(updateTab(this.state, tabId, patch));
  }

  createGroup(
    tabIds: readonly [string, ...string[]],
    orientation: Orientation
  ): Result<string, ProfilesError> {
    const made = createGroup(
      this.state,
      tabIds,
      orientation,
      this.#options.ids
    );
    if (!made.ok) {
      return made;
    }
    const committed = this.#commit(ok(made.value.state));
    return committed.ok ? ok(made.value.groupId) : committed;
  }

  splitInto(
    tabId: string,
    placement: Placement
  ): Result<undefined, ProfilesError> {
    return this.#commit(
      splitInto(this.state, tabId, placement, this.#options.ids)
    );
  }

  leaveGroup(tabId: string): Result<undefined, ProfilesError> {
    return this.#commit(leaveGroup(this.state, tabId, this.#options.ids));
  }

  resize(
    groupId: string,
    splitId: string,
    ratio: number
  ): Result<undefined, ProfilesError> {
    return this.#commit(resizeSplit(this.state, groupId, splitId, ratio));
  }

  /** Writes what is pending now. */
  async flush(): Promise<void> {
    await this.#store.flush();
  }

  #deactivated(): Set<string> {
    return deactivatedProfiles(
      orderedProfiles(this.state.profiles).map((profile) => profile.id),
      this.#entitlement,
      this.#options.clock.now()
    );
  }

  // A profile the entitlement no longer allows cannot stay selected; the first one, which every entitlement allows, takes over.
  #reselect(): void {
    if (!this.isDeactivated(this.state.selectedProfileId)) {
      return;
    }
    const [first] = orderedProfiles(this.state.profiles);
    if (first !== undefined) {
      this.#commit(selectProfile(this.state, first.id));
    }
  }

  #commit(
    next: Result<ProfilesState, StateError>
  ): Result<undefined, ProfilesError> {
    if (!next.ok) {
      return next;
    }
    const problems = validateState(next.value);
    if (problems.length > 0) {
      this.#options.onError(
        new Error(
          `A change to the profiles was refused: ${problems.join("; ")}`
        )
      );
      return err("invalid");
    }
    const before = this.state.selectedProfileId;
    this.#state = next.value;
    this.#store.write(next.value);
    this.#publish();
    const { events } = this.#options;
    if (next.value.selectedProfileId !== before) {
      const group = this.currentGroup(next.value.selectedProfileId);
      if (group !== undefined) {
        events.emit("profile.selected", {
          groupId: group.id,
          profileId: next.value.selectedProfileId,
        });
      }
    }
    events.emit("stage.invalidated", null);
    return ok(undefined);
  }

  #publish(): void {
    const snapshot = this.snapshot();
    for (const contentsId of this.#pages) {
      this.#options.registrar.push(
        contentsId,
        profilesPushes.changed,
        snapshot
      );
    }
  }

  async #clear(partition: string): Promise<void> {
    try {
      await this.#options.sessions.clear(partition);
    } catch (error) {
      this.#options.onError(error);
    }
  }
}
