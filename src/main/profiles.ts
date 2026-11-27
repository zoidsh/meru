import { Mutex, isEqual } from "es-toolkit";

import type { App } from "#core/apps.ts";
import { removeBookmark, toggleBookmark } from "#core/bookmarks.ts";
import type { BookmarkedPage } from "#core/bookmarks.ts";
import {
  entitledView,
  lockedProfiles,
  stateGrants,
  storedAfterView,
} from "#core/entitled-profiles.ts";
import type { StateGrants } from "#core/entitled-profiles.ts";
import type { Capability } from "#core/entitlement.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import type { PaneDirection, Split } from "#core/pane-tree.ts";
import { firstUnusedColor } from "#core/profile-color.ts";
import type { ProfileColorName } from "#core/profile-color.ts";
import {
  addSavedSearch,
  removeSavedSearch,
  renameSavedSearch,
} from "#core/saved-searches.ts";
import type { SavedSearchRefusal } from "#core/saved-searches.ts";
import type { OpenAppsIn } from "#core/settings.ts";
import {
  addProfile,
  isAsleep,
  forgetEndedDoNotDisturb,
  forgetProfilesToClear,
  knownTabs,
  newProfile,
  nextProfileName,
  profilePartition,
  moveProfile,
  removeProfile,
  renameProfile,
  setProfileColor,
  selectProfile,
  setTabbedInbox,
  setCheckMail,
  setProfileEnabled,
  sleepProfile,
  sortProfilesToClear,
  switchDoNotDisturb,
} from "#core/state.ts";
import type { State } from "#core/state.ts";
import { closeOtherTabs, closeTabsBelow } from "#core/tab-menu.ts";
import {
  closeTab,
  dropInView,
  maximizePane,
  moveInBox,
  moveTab,
  moveToMainWindow,
  moveToOwnWindow,
  openTab,
  resizeSplit,
  selectTab,
  separateTab,
  setOpenAtLaunch,
  setOwnWindowBounds,
  setPinned,
  setSleepWhenIdle,
  splitOntoTab,
  splitTab,
  updatePages,
} from "#core/tabs.ts";
import type { OpenedTab, PageUpdate, TabKey } from "#core/tabs.ts";
import type { Rectangle, Size } from "#core/window-bounds.ts";

export interface ProfilesDeps {
  initial: State;
  save: (state: State) => Promise<void>;
  newId: () => string;
  /** The automatic name of the nth profile, in the person's language. */
  profileName: (n: number) => string;
  /** Deletes everything the session holds on disk. */
  clearSession: (partition: string) => Promise<void>;
  /** Milliseconds since the epoch, by which a write drops an ended Do Not Disturb. */
  now: () => number;
  log: Log;
  /**
   * Whether this run may use more than one profile, the entitlement's
   * `can("profiles")`, asked again at each `recheck`; every profile when
   * absent.
   */
  multipleProfiles?: () => boolean;
  /**
   * The entitlement's `can`, asked again at each `recheck`: without
   * `notificationGates` the state has no Do Not Disturb and none is
   * switched, the stored one kept. Everything when absent.
   */
  can?: (capability: Capability) => boolean;
  /**
   * Where a new tab of a Google app starts for the profile, as Tabs & Google
   * Apps says now; the main window when absent.
   */
  openAppsIn?: (profileId: string) => OpenAppsIn;
}

/**
 * The profiles, which main alone holds. A change is saved before it is
 * committed, so a failed write leaves the old state standing, and changes go
 * one at a time, in the order they were asked for.
 */
export const createProfiles = ({
  initial,
  save,
  newId,
  profileName,
  clearSession,
  now,
  log,
  multipleProfiles = () => true,
  can = () => true,
  openAppsIn = () => "tabs",
}: ProfilesDeps) => {
  const mutex = new Mutex();
  const listeners = new Set<(state: State) => void>();
  const removalListeners = new Set<(profileId: string) => void>();
  const grantsNow = (): StateGrants => ({
    ...stateGrants(can),
    profiles: multipleProfiles(),
  });
  let grants = grantsNow();
  // What the file holds, and what this run may use of it, which every reader
  // and every change but the clears sees.
  let stored = initial;
  let state = entitledView(stored, grants);

  const notify = () => {
    for (const listener of listeners) {
      try {
        listener(state);
      } catch (error) {
        log("profiles-listener-failed", { error: scrub.error(error) });
      }
    }
  };

  /** `next` is a change of `state` made in the same turn. */
  const commit = async (next: State | undefined) => {
    if (!next) {
      return false;
    }

    // Dropped with a write that happens anyway, never by one of its own.
    const written = storedAfterView(
      stored,
      grants,
      forgetEndedDoNotDisturb(next, now())
    );

    await save(written);

    const kept = new Set(written.profiles.map(({ id }) => id));
    const removed = stored.profiles
      .map(({ id }) => id)
      .filter((id) => !kept.has(id));

    stored = written;
    state = entitledView(stored, grants);
    notify();

    for (const profileId of removed) {
      for (const listener of removalListeners) {
        try {
          listener(profileId);
        } catch (error) {
          log("profile-removal-listener-failed", {
            error: scrub.error(error),
          });
        }
      }
    }

    return true;
  };

  /** Within `exclusive`. A failure is logged and the id kept for next time. */
  const clearAndForget = async (profileIds: readonly string[]) => {
    const results = await Promise.allSettled(
      profileIds.map((profileId) => clearSession(profilePartition(profileId)))
    );
    const cleared = profileIds.filter((profileId, index) => {
      const result = results[index];

      if (result?.status === "rejected") {
        log("profile-data-clear-failed", { error: scrub.error(result.reason) });
      }

      return result?.status === "fulfilled";
    });

    try {
      await commit(forgetProfilesToClear(state, cleared));
    } catch (error) {
      log("profiles-to-clear-save-failed", {
        cleared: cleared.length,
        error: scrub.error(error),
      });
    }
  };

  /**
   * Within `exclusive`: deletes the data of each of `profileIds` on the list
   * to clear, but never of an id an entry still holds, readable or not, as a
   * hand-edited file can; that one is only dropped from the list.
   */
  const settleClears = async (profileIds: readonly string[]) => {
    // The stored state, so a profile this run does not use counts as listed.
    const sorted = sortProfilesToClear(stored);
    const clear = sorted.clear.filter((id) => profileIds.includes(id));
    const stillListed = sorted.stillListed.filter((id) =>
      profileIds.includes(id)
    );

    for (const profileId of stillListed) {
      log("profile-data-kept", { profile: scrub.profile(profileId) });
    }

    if (stillListed.length > 0) {
      await commit(forgetProfilesToClear(state, stillListed)).catch(
        (error: unknown) => {
          log("profiles-to-clear-save-failed", { error: scrub.error(error) });
        }
      );
    }

    await clearAndForget(clear);
  };

  /**
   * Whether the run holds `grant`; a change that needs it is refused into
   * the log, whichever window or key asked.
   */
  const allows = (grant: keyof StateGrants) => {
    if (grants[grant]) {
      return true;
    }

    log("profile-change-refused", { needs: grant });

    return false;
  };

  /** Throws while the run holds no saved searches, which stay stored. */
  const assertSavedSearches = () => {
    if (!grants.savedSearches) {
      throw new Error("Saved searches need Meru Pro");
    }
  };

  const exclusive = async <T>(work: () => Promise<T>) => {
    await mutex.acquire();

    try {
      return await work();
    } finally {
      mutex.release();
    }
  };

  const asleep = (profileId: string) => {
    const profile = state.profiles.find((one) => one.id === profileId);

    return profile !== undefined && isAsleep(state, profile);
  };

  /** A change that needs `grant`, refused as one that changed nothing without it. */
  const gated =
    <Args extends unknown[]>(
      grant: keyof StateGrants,
      change: (current: State, ...args: Args) => State | undefined
    ) =>
    (...args: Args) =>
      exclusive(() =>
        allows(grant) ? commit(change(state, ...args)) : Promise.resolve(false)
      );

  return {
    get: () => state,
    /** The stored profiles this run does not use, for Settings to list. */
    locked: () => lockedProfiles(stored, grants.profiles),
    /**
     * Asks `multipleProfiles` and `can` again, for a change of the
     * entitlement, and tells every listener when an answer changed.
     */
    recheck: () => {
      const next = grantsNow();

      if (isEqual(next, grants)) {
        return;
      }

      grants = next;
      state = entitledView(stored, grants);
      notify();
    },
    /** Settles once every change asked for so far is written, for a quit to wait on. */
    settled: () => exclusive(() => Promise.resolve()),
    onChange: (listener: (state: State) => void) => {
      listeners.add(listener);
    },
    /**
     * Called with each profile a committed change took off the stored list,
     * after the change's listeners; never for one the run only stops using.
     */
    onRemoved: (listener: (profileId: string) => void) => {
      removalListeners.add(listener);
    },
    /** Selects the profile, waking it if it sleeps. */
    select: (profileId: string) =>
      exclusive(async () => {
        const wakes = asleep(profileId);
        const committed = await commit(selectProfile(state, profileId));

        if (committed && wakes) {
          log("profile-woken", { profile: scrub.profile(profileId) });
        }

        return committed;
      }),
    /** Puts the profile to sleep, selecting the next awake one if it was selected. */
    sleep: (profileId: string) =>
      exclusive(async () => {
        const committed = await commit(sleepProfile(state, profileId));

        if (committed) {
          log("profile-slept", { profile: scrub.profile(profileId) });
        }

        return committed;
      }),
    /**
     * Adds a profile, selected, with the first colour no profile has; gives
     * its id, or nothing when it could not be saved or this run may use one
     * profile alone.
     */
    add: () =>
      exclusive(async () => {
        if (!grants.profiles) {
          return;
        }

        const profile = {
          ...newProfile(newId(), nextProfileName(state, profileName)),
          color: firstUnusedColor(state),
        };

        if (!(await commit(addProfile(state, profile)))) {
          return;
        }

        log("profile-added", {
          profile: scrub.profile(profile.id),
          profiles: state.profiles.length,
        });

        return profile.id;
      }),
    /** Nothing when it is not listed, the index is outside the row, or it is there. */
    move: (profileId: string, toIndex: number) =>
      exclusive(() => commit(moveProfile(state, profileId, toIndex))),
    /** Nothing when it is not listed or has the colour stored already. */
    setColor: (profileId: string, color: ProfileColorName) =>
      exclusive(() => commit(setProfileColor(state, profileId, color))),
    /** Nothing when it is not listed or its Check mail is already so. */
    setCheckMail: (profileId: string, on: boolean) =>
      exclusive(() => commit(setCheckMail(state, profileId, on))),
    /** Nothing when it is so already, or it is the last enabled profile. */
    setEnabled: (profileId: string, enabled: boolean) =>
      exclusive(() => commit(setProfileEnabled(state, profileId, enabled))),
    /** Nothing when the name is empty, too long or the one it has. */
    rename: (profileId: string, name: string) =>
      exclusive(() => commit(renameProfile(state, profileId, name))),
    /**
     * Opens `url` as a tab of `app`, selected, or in a window of its own as
     * `openAppsIn` says for the profile; a new tab gets `tabId`, and goes
     * after the tab `after` names, if any.
     */
    openTab: (
      profileId: string,
      app: App,
      url: string,
      tabId: string,
      after?: string,
      split?: PaneDirection
    ) =>
      exclusive(async (): Promise<OpenedTab | undefined> => {
        const profile = state.profiles.find(({ id }) => id === profileId);
        // A single-instance app's tab takes the URL, so no tab opens.
        const opensNone =
          app.singleInstance &&
          profile !== undefined &&
          knownTabs(profile).some((tab) => tab.app === app.id);

        if (
          (!opensNone && !allows("workspaceApps")) ||
          (split !== undefined && !allows("splitView"))
        ) {
          return undefined;
        }

        const opened = openTab(
          state,
          profileId,
          app,
          url,
          () => tabId,
          after,
          split,
          openAppsIn(profileId)
        );

        return opened && (await commit(opened.state)) ? opened : undefined;
      }),
    selectTab: (key: TabKey) => exclusive(() => commit(selectTab(state, key))),
    closeTab: gated("workspaceApps", (current, key: TabKey) =>
      closeTab(current, key)
    ),
    splitTab: gated(
      "splitView",
      (current, key: TabKey, direction: PaneDirection) =>
        splitTab(current, key, direction)
    ),
    separateTab: gated("splitView", (current, key: TabKey) =>
      separateTab(current, key)
    ),
    moveToOwnWindow: gated("workspaceApps", (current, key: TabKey) =>
      moveToOwnWindow(current, key)
    ),
    moveToMainWindow: gated(
      "workspaceApps",
      (current, key: TabKey, select: boolean) =>
        moveToMainWindow(current, key, select)
    ),
    setOwnWindowBounds: gated(
      "workspaceApps",
      (current, key: TabKey, bounds: Rectangle) =>
        setOwnWindowBounds(current, key, bounds)
    ),
    maximizePane: gated("splitView", (current, key: TabKey, on: boolean) =>
      maximizePane(current, key, on)
    ),
    resizeSplit: gated(
      "splitView",
      (current, profileId: string, split: Split) =>
        resizeSplit(current, profileId, split)
    ),
    moveTab: gated("workspaceApps", (current, key: TabKey, before?: string) =>
      moveTab(current, key, before)
    ),
    moveInBox: gated("splitView", (current, key: TabKey, before?: string) =>
      moveInBox(current, key, before)
    ),
    splitOntoTab: gated("splitView", (current, key: TabKey, target: string) =>
      splitOntoTab(current, key, target)
    ),
    dropInView: gated(
      "splitView",
      (current, key: TabKey, size: Size, point: { x: number; y: number }) =>
        dropInView(current, key, size, point)
    ),
    closeOtherTabs: gated("workspaceApps", (current, key: TabKey) =>
      closeOtherTabs(current, key)
    ),
    closeTabsBelow: gated("workspaceApps", (current, key: TabKey) =>
      closeTabsBelow(current, key)
    ),
    setPinned: gated("workspaceApps", (current, key: TabKey, pinned: boolean) =>
      setPinned(current, key, pinned)
    ),
    setOpenAtLaunch: gated(
      "workspaceApps",
      (current, key: TabKey, on: boolean) => setOpenAtLaunch(current, key, on)
    ),
    setSleepWhenIdle: gated(
      "workspaceApps",
      (current, key: TabKey, on: boolean) => setSleepWhenIdle(current, key, on)
    ),
    updatePages: (updates: PageUpdate[]) =>
      exclusive(() => commit(updatePages(state, updates))),
    /**
     * Lists the profile no more and puts it on the list to clear, in one
     * write, which closes its view; then deletes its data and takes it off
     * the list. Data is never gone for a profile still listed, and a clear
     * that a failure or a quit interrupts is finished at the next launch.
     */
    remove: (profileId: string) =>
      exclusive(async () => {
        const place =
          state.profiles.findIndex((one) => one.id === profileId) + 1;

        if (!(await commit(removeProfile(state, profileId)))) {
          return false;
        }

        log("profile-removed", { place, profiles: state.profiles.length });

        await settleClears([profileId]);

        return true;
      }),
    /**
     * Forgets a Do Not Disturb that has ended by now, deciding so in turn
     * with every other change, and writes only if there was one to forget.
     */
    forgetEndedDoNotDisturb: () =>
      exclusive(() => {
        const next = forgetEndedDoNotDisturb(state, now());

        return next === state ? Promise.resolve(false) : commit(next);
      }),
    /** Writes only a change, so a page saying the same again costs nothing. */
    setTabbedInbox: (profileId: string, tabbed: boolean) =>
      exclusive(() => commit(setTabbedInbox(state, profileId, tabbed))),
    /** Why the search cannot be added, or nothing once it is. */
    addSavedSearch: (profileId: string, query: string, name?: string) =>
      exclusive(async (): Promise<SavedSearchRefusal | undefined> => {
        assertSavedSearches();

        const added = addSavedSearch(state, profileId, { query, name }, newId);

        if ("refused" in added) {
          return added.refused;
        }

        await commit(added.state);

        return undefined;
      }),
    renameSavedSearch: (profileId: string, searchId: string, name: string) =>
      exclusive(() => {
        assertSavedSearches();

        return commit(renameSavedSearch(state, profileId, searchId, name));
      }),
    removeSavedSearch: (profileId: string, searchId: string) =>
      exclusive(() => {
        assertSavedSearches();

        return commit(removeSavedSearch(state, profileId, searchId));
      }),
    /**
     * Bookmarks the page in the profile, or removes its bookmark; says
     * whether it is bookmarked now, or nothing when nothing changed.
     */
    toggleBookmark: (profileId: string, page: BookmarkedPage) =>
      exclusive(async () => {
        if (!allows("bookmarks")) {
          return;
        }

        const toggled = toggleBookmark(state, profileId, page, newId);

        return toggled && (await commit(toggled.state))
          ? toggled.bookmarked
          : undefined;
      }),
    removeBookmark: gated(
      "bookmarks",
      (current, profileId: string, id: string) =>
        removeBookmark(current, profileId, id)
    ),
    /** Saves the change one returns; nothing for none. */
    change: (next: (current: State) => State | undefined) =>
      exclusive(() => commit(next(state))),
    /** On until `until`, `null` for until turned off, or off with `undefined`. */
    switchDoNotDisturb: (until: number | null | undefined) =>
      exclusive(() =>
        grants.notificationGates
          ? commit(switchDoNotDisturb(state, until))
          : Promise.reject(new Error("Do Not Disturb needs Meru Pro"))
      ),
    /**
     * Run once at startup, before any view exists: deletes the data of each
     * profile a removal did not finish clearing.
     */
    finishClears: () =>
      exclusive(() => settleClears(stored.profilesToClear ?? [])),
  };
};

export type Profiles = ReturnType<typeof createProfiles>;
