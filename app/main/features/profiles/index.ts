import { isEqual } from "es-toolkit";

import { DisposableStore } from "../../../core/disposable.ts";
import { groupOf, orderedProfiles } from "../../../core/engines/ordering.ts";
import { repairState } from "../../../core/engines/state-repair.ts";
import { validateState } from "../../../core/engines/state-validate.ts";
import {
  addProfile,
  equaliseGroup,
  canClose,
  closeTab,
  openTab,
  firstState,
  firstGroup,
  joinTab,
  leaveGroup,
  letSleep,
  moveTabTo,
  removeProfile,
  resizeSplit,
  selectProfile,
  setProfileStatus,
  newProfile,
  newTab,
  swapPanes,
  updateProfile,
} from "../../../core/engines/state.ts";
import type { ProfilePatch, StateError } from "../../../core/engines/state.ts";
import { deactivatedProfiles, canUse } from "../../../core/entitlement/gate.ts";
import type { Gate, GateRefusal } from "../../../core/entitlement/gate.ts";
import type { AppEvents } from "../../../core/events.ts";
import type { LogPort } from "../../../core/log.ts";
import type {
  LifecyclePort,
  Clock,
  FsPort,
  Ids,
  SessionPort,
} from "../../../core/ports.ts";
import type { Entitlement } from "../../../core/records/entitlement.ts";
import type { Group } from "../../../core/records/group.ts";
import type { Placement, Beside } from "../../../core/records/layout.ts";
import { partitionOf } from "../../../core/records/profile.ts";
import type { Profile, ProfileStatus } from "../../../core/records/profile.ts";
import { profilesStateSchema } from "../../../core/records/profiles-state.ts";
import type { ProfilesState } from "../../../core/records/profiles-state.ts";
import type { Tab } from "../../../core/records/tab.ts";
import { err, ok } from "../../../core/result.ts";
import type { Result } from "../../../core/result.ts";
import { SnapshotStore } from "../../../core/snapshot.ts";
import type { Opened, SnapshotSpec } from "../../../core/snapshot.ts";
import { stepFrom } from "../../../core/values.ts";
import { appById, gmail, isSingleInstanceId } from "../../../shared/apps.ts";
import type { IpcRegistrar } from "../../../shared/channels/define.ts";
import {
  profiles as profileChannels,
  profilesPushes,
  tabs as tabChannels,
} from "../../../shared/channels/profiles.ts";
import type { ProfilesSnapshot } from "../../../shared/channels/profiles.ts";
import type {
  CommandRegistrar,
  GuardedHandler,
} from "../../../shared/commands/define.ts";
import type { SettingsStore } from "../settings/index.ts";
import { profilesCommands } from "./commands.ts";
import { tabsSleepByChoice } from "./migrations.ts";

export const PROFILES_FILE = "profiles.json";

export type ProfilesError =
  | StateError
  | GateRefusal
  | "unknownApp"
  /** The entitlement does not allow the profile now. */
  | "deactivated"
  /** The change would have broken an invariant of the state, which is a bug, reported. */
  | "invalid";

export const profilesSnapshot = (
  ids: Ids
): SnapshotSpec<ProfilesState, string> => ({
  migrations: [tabsSleepByChoice],
  name: PROFILES_FILE,
  recover: (data) => {
    if (data === undefined) {
      return { fallbacks: [], value: firstState(ids, gmail) };
    }
    const repaired = repairState(data, {
      fresh: () => firstState(ids, gmail),
      ids,
      tabFor: (profileId) => newTab(ids, profileId, gmail),
    });
    return { fallbacks: repaired.dropped, value: repaired.state };
  },
  schema: profilesStateSchema.superRefine((state, context) => {
    for (const message of validateState(state, isSingleInstanceId)) {
      context.addIssue({ code: "custom", message });
    }
  }),
  version: 2,
});

const done = (result: Result<undefined, ProfilesError>): Result<null, string> =>
  result.ok ? ok(null) : result;

export interface ProfilesOptions {
  readonly fs: FsPort;
  readonly clock: Clock;
  readonly lifecycle: Pick<LifecyclePort, "onQuit">;
  readonly ids: Ids;
  readonly events: AppEvents;
  readonly registrar: IpcRegistrar;
  readonly commands: CommandRegistrar;
  readonly sessions: SessionPort;
  readonly settings: Pick<SettingsStore, "removeProfile">;
  /** The entitlement at construction; later values arrive as `entitlement.changed`. */
  readonly entitlement: Entitlement;
  readonly log: LogPort;
}

/** Owns profiles.json: every profile, tab and group, and which profile is selected. */
export class Profiles {
  readonly #options: ProfilesOptions;
  readonly #store: SnapshotStore<ProfilesState, string>;
  readonly #disposables = new DisposableStore();
  #entitlement: Entitlement;
  #state: ProfilesState | undefined;
  #asleep: ReadonlySet<string> = new Set();

  constructor(options: ProfilesOptions) {
    this.#options = options;
    this.#entitlement = options.entitlement;
    this.#store = new SnapshotStore(profilesSnapshot(options.ids), {
      lifecycle: options.lifecycle,
      clock: options.clock,
      fs: options.fs,
      log: options.log,
    });
  }

  async open(): Promise<Opened<ProfilesState, string>> {
    const opened = await this.#store.open();
    this.#state = opened.value;
    if (opened.fallbacks.length > 0) {
      this.#options.log.warn(
        "The profiles file dropped what it could not hold",
        {
          dropped: opened.fallbacks,
          file: PROFILES_FILE,
        }
      );
    }
    if (opened.source === "missing") {
      this.#store.write(opened.value);
    } else if (opened.source !== "file") {
      this.#options.log.warn(
        "The profiles file could not be read, so the app starts with one profile",
        { file: PROFILES_FILE, source: opened.source }
      );
    }
    return opened;
  }

  start(): void {
    const { registrar, events } = this.#options;
    this.#disposables.add(
      () => {
        this.#store.dispose();
      },
      registrar.register(profileChannels, {
        create: ({ label, color }) => this.createProfile(label, color),
        remove: ({ profileId }) => done(this.removeProfile(profileId)),
        select: ({ profileId }) => done(this.selectProfile(profileId)),
        snapshot: () => ok(this.snapshot()),
        update: ({ profileId, ...patch }) =>
          done(this.updateProfile(profileId, patch)),
      }),
      registrar.register(tabChannels, {
        add: ({ profileId, appId }) => this.addTab(profileId, appId),
        close: ({ tabId }) => done(this.closeTab(tabId)),
        focus: ({ tabId }) => done(this.focusTab(tabId)),
        join: ({ tabId, targetTabId, orientation, side }) =>
          done(this.joinTab(tabId, targetTabId, { orientation, side })),
        leave: ({ tabId, to }) => done(this.leaveGroup(tabId, to)),
        move: ({ tabId, to }) => done(this.moveTab(tabId, to)),
      }),
      this.#options.commands.register(profilesCommands, {
        next: this.#step(1),
        previous: this.#step(-1),
        select1: this.#selectAt(0),
        select2: this.#selectAt(1),
        select3: this.#selectAt(2),
        select4: this.#selectAt(3),
        select5: this.#selectAt(4),
        select6: this.#selectAt(5),
        select7: this.#selectAt(6),
        select8: this.#selectAt(7),
        select9: this.#selectAt(8),
      }),
      events.on("entitlement.changed", ({ entitlement }) => {
        this.#entitlement = entitlement;
        this.#reselect();
        this.#publish();
        events.emit("profiles.changed", null);
      })
    );
  }

  dispose(): void {
    this.#disposables.dispose();
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
    const gate = this.#newProfileGate();
    return {
      ...this.state,
      newProfileRefusal: gate.allowed ? null : gate.reason,
      profiles: this.state.profiles.map((profile) => ({
        ...profile,
        deactivated: deactivated.has(profile.id),
      })),
      tabs: this.state.tabs.map((tab) => ({
        ...tab,
        asleep: this.#asleep.has(tab.id),
        closeable: canClose(this.state, tab.id, isSingleInstanceId).ok,
      })),
    };
  }

  createProfile(label: string, color?: string): Result<Profile, ProfilesError> {
    const { ids } = this.#options;
    const gate = this.#newProfileGate();
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

  /** Renames a profile or changes its colour, deactivated or not. */
  updateProfile(
    profileId: string,
    patch: ProfilePatch
  ): Result<undefined, ProfilesError> {
    return this.#commit(updateProfile(this.state, profileId, patch));
  }

  selectProfile(profileId: string): Result<undefined, ProfilesError> {
    if (this.isDeactivated(profileId)) {
      return err("deactivated");
    }
    return this.#commit(selectProfile(this.state, profileId));
  }

  /** Adds a tab of the app after the profile's others, in a group of its own or split into a group's pane; a single-instance app the profile has is answered with its tab. */
  addTab(
    profileId: string,
    appId: string,
    placement?: Placement
  ): Result<Tab, ProfilesError> {
    return this.openTab(profileId, appId, placement);
  }

  /** The tab an app opens to in a profile: the profile's one tab of a single-instance app when it has it, else a new tab at `url`, or the app's start page, as addTab adds it. */
  openTab(
    profileId: string,
    appId: string,
    placement?: Placement,
    url?: string
  ): Result<Tab, ProfilesError> {
    const app = appById(appId);
    if (app === undefined) {
      return err("unknownApp");
    }
    const { ids } = this.#options;
    const fresh = newTab(ids, profileId, app);
    const opened = openTab(
      this.state,
      url === undefined ? fresh : { ...fresh, url },
      ids,
      isSingleInstanceId,
      placement
    );
    if (!opened.ok) {
      return opened;
    }
    const committed = this.#commit(ok(opened.value.state));
    return committed.ok ? ok(opened.value.tab) : committed;
  }

  /** Records what the profile's feed last said, telling every page only when it changed; nothing about the stage changes with it. */
  setStatus(
    profileId: string,
    status: ProfileStatus
  ): Result<undefined, ProfilesError> {
    const found = this.state.profiles.find(
      (profile) => profile.id === profileId
    );
    if (found !== undefined && isEqual(found.status, status)) {
      return ok(undefined);
    }
    const next = setProfileStatus(this.state, profileId, status);
    if (!next.ok) {
      return next;
    }
    this.#state = next.value;
    this.#store.write(next.value);
    this.#publish();
    return ok(undefined);
  }

  closeTab(tabId: string): Result<undefined, ProfilesError> {
    return this.#commit(closeTab(this.state, tabId, isSingleInstanceId));
  }

  /** Lets the tab sleep once it has been out of sight a while, or keeps it awake. */
  letSleep(tabId: string, sleeps: boolean): Result<undefined, ProfilesError> {
    return this.#commit(
      letSleep(this.state, tabId, sleeps, isSingleInstanceId)
    );
  }

  /** Records which tabs are asleep, which only the app knows and nothing stores, telling every page when it changed. */
  setAsleep(tabIds: ReadonlySet<string>): void {
    if (isEqual(tabIds, this.#asleep)) {
      return;
    }
    this.#asleep = new Set(tabIds);
    this.#publish();
  }

  /** Brings a tab to the front: its profile selected, its group shown, its pane focused. */
  focusTab(tabId: string): Result<undefined, ProfilesError> {
    const tab = this.tab(tabId);
    const group = groupOf(tabId, this.state.groups);
    if (tab === undefined || group === undefined) {
      return err("unknownTab");
    }
    if (tab.profileId !== this.state.selectedProfileId) {
      const selected = this.selectProfile(tab.profileId);
      if (!selected.ok) {
        return selected;
      }
    }
    this.#options.events.emit("tab.focused", { groupId: group.id, tabId });
    return ok(undefined);
  }

  /** Takes a tab out of its group into a group of its own, at row `to` of its profile's list when given. */
  leaveGroup(tabId: string, to?: number): Result<undefined, ProfilesError> {
    return this.#commit(
      leaveGroup(this.state, tabId, this.#options.ids, isSingleInstanceId, to)
    );
  }

  /** Puts a tab beside another tab's pane where `beside` says, leaving its own group first when that is another, and brings it to the front. */
  joinTab(
    tabId: string,
    targetTabId: string,
    beside: Beside
  ): Result<undefined, ProfilesError> {
    const committed = this.#commit(
      joinTab(
        this.state,
        tabId,
        targetTabId,
        beside,
        this.#options.ids,
        isSingleInstanceId
      )
    );
    return committed.ok ? this.focusTab(tabId) : committed;
  }

  moveTab(tabId: string, to: number): Result<undefined, ProfilesError> {
    return this.#commit(moveTabTo(this.state, tabId, to, isSingleInstanceId));
  }

  resize(
    groupId: string,
    splitId: string,
    ratio: number
  ): Result<undefined, ProfilesError> {
    return this.#commit(resizeSplit(this.state, groupId, splitId, ratio));
  }

  /** Trades the places of two of the group's panes, each keeping its tab. */
  swapPanes(
    groupId: string,
    a: string,
    b: string
  ): Result<undefined, ProfilesError> {
    return this.#commit(swapPanes(this.state, groupId, a, b));
  }

  /** Evens the shares of every run of the group's splits of one orientation. */
  equaliseGroup(groupId: string): Result<undefined, ProfilesError> {
    return this.#commit(equaliseGroup(this.state, groupId));
  }

  async flush(): Promise<void> {
    await this.#store.flush();
  }

  /** The profiles the titlebar shows, in its order: every one the entitlement allows. */
  #selectable(): Profile[] {
    const deactivated = this.#deactivated();
    return orderedProfiles(this.state.profiles).filter(
      (profile) => !deactivated.has(profile.id)
    );
  }

  #selectAt(index: number): GuardedHandler {
    return {
      run: () => {
        const profile = this.#selectable()[index];
        return profile === undefined
          ? err("unknownProfile")
          : done(this.selectProfile(profile.id));
      },
      when: () => this.#selectable()[index] !== undefined,
    };
  }

  #step(by: 1 | -1): GuardedHandler {
    return {
      run: () => {
        const next = stepFrom(
          this.#selectable().map((profile) => profile.id),
          this.state.selectedProfileId,
          by
        );
        return next === undefined
          ? err("unknownProfile")
          : done(this.selectProfile(next));
      },
      when: () => this.#selectable().length > 1,
    };
  }

  #newProfileGate(): Gate {
    return canUse(this.#entitlement, "extraProfile", {
      now: this.#options.clock.now(),
      profiles: this.state.profiles.length,
    });
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
    const problems = validateState(next.value, isSingleInstanceId);
    if (problems.length > 0) {
      this.#options.log.error("A change to the profiles was refused", {
        problems,
      });
      return err("invalid");
    }
    const before = this.state;
    this.#state = next.value;
    this.#store.write(next.value);
    this.#publish();
    const { events } = this.#options;
    if (next.value.selectedProfileId !== before.selectedProfileId) {
      const group = this.currentGroup(next.value.selectedProfileId);
      if (group !== undefined) {
        events.emit("profile.selected", { groupId: group.id });
      }
    }
    if (!isEqual(before.profiles, next.value.profiles)) {
      events.emit("profiles.changed", null);
    }
    events.emit("stage.invalidated", null);
    return ok(undefined);
  }

  #publish(): void {
    this.#options.registrar.broadcast(profilesPushes.changed, this.snapshot());
    this.#options.events.emit("menu.invalidated", null);
  }

  async #clear(partition: string): Promise<void> {
    try {
      await this.#options.sessions.clear(partition);
    } catch (error) {
      this.#options.log.error("Could not clear a profile's session", {
        error,
        partition,
      });
    }
  }
}
