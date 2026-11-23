import { Mutex } from "es-toolkit";

import type { App } from "#core/apps.ts";
import { removeBookmark, toggleBookmark } from "#core/bookmarks.ts";
import type { BookmarkedPage } from "#core/bookmarks.ts";
import type { PaneDirection, Split } from "#core/pane-tree.ts";
import { firstUnusedColor } from "#core/profile-color.ts";
import type { ProfileColorName } from "#core/profile-color.ts";
import {
  addSavedSearch,
  removeSavedSearch,
  renameSavedSearch,
} from "#core/saved-searches.ts";
import type { SavedSearchRefusal } from "#core/saved-searches.ts";
import {
  addProfile,
  forgetEndedDoNotDisturb,
  forgetProfilesToClear,
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
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

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
}: ProfilesDeps) => {
  const mutex = new Mutex();
  const listeners = new Set<(state: State) => void>();
  let state = initial;

  const commit = async (next: State | undefined) => {
    if (!next) {
      return false;
    }

    // Dropped with a write that happens anyway, never by one of its own.
    const written = forgetEndedDoNotDisturb(next, now());

    await save(written);
    state = written;

    for (const listener of listeners) {
      try {
        listener(state);
      } catch (error) {
        log(`A profiles listener failed: ${describe(error)}`);
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
        log(
          `The data of removed profile ${profileId} in ${profilePartition(profileId)} was not deleted, and will be tried again at the next launch: ${describe(result.reason)}`
        );
      }

      return result?.status === "fulfilled";
    });

    try {
      await commit(forgetProfilesToClear(state, cleared));
    } catch (error) {
      log(
        `Deleted the data of ${cleared.join(", ")}, but the list of profiles to clear was not saved: ${describe(error)}`
      );
    }
  };

  /**
   * Within `exclusive`: deletes the data of each of `profileIds` on the list
   * to clear, but never of an id an entry still holds, readable or not, as a
   * hand-edited file can; that one is only dropped from the list.
   */
  const settleClears = async (profileIds: readonly string[]) => {
    const sorted = sortProfilesToClear(state);
    const clear = sorted.clear.filter((id) => profileIds.includes(id));
    const stillListed = sorted.stillListed.filter((id) =>
      profileIds.includes(id)
    );

    for (const profileId of stillListed) {
      log(
        `Kept the data of profile ${profileId}, which was on the list to clear but is still listed`
      );
    }

    if (stillListed.length > 0) {
      await commit(forgetProfilesToClear(state, stillListed)).catch(
        (error: unknown) => {
          log(
            `The list of profiles to clear was not saved: ${describe(error)}`
          );
        }
      );
    }

    await clearAndForget(clear);
  };

  const exclusive = async <T>(work: () => Promise<T>) => {
    await mutex.acquire();

    try {
      return await work();
    } finally {
      mutex.release();
    }
  };

  return {
    get: () => state,
    /** Settles once every change asked for so far is written, for a quit to wait on. */
    settled: () => exclusive(() => Promise.resolve()),
    onChange: (listener: (state: State) => void) => {
      listeners.add(listener);
    },
    /** Selects the profile, waking it if it sleeps. */
    select: (profileId: string) =>
      exclusive(() => commit(selectProfile(state, profileId))),
    /** Puts the profile to sleep, selecting the next awake one if it was selected. */
    sleep: (profileId: string) =>
      exclusive(() => commit(sleepProfile(state, profileId))),
    /**
     * Adds a profile, selected, with the first colour no profile has; gives
     * its id, or nothing when it could not be saved.
     */
    add: () =>
      exclusive(async () => {
        const profile = {
          ...newProfile(newId(), nextProfileName(state, profileName)),
          color: firstUnusedColor(state),
        };

        return (await commit(addProfile(state, profile)))
          ? profile.id
          : undefined;
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
     * Opens `url` as a tab of `app`, selected; a new tab gets `tabId`, and
     * goes after the tab `after` names, if any.
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
        const opened = openTab(
          state,
          profileId,
          app,
          url,
          () => tabId,
          after,
          split
        );

        return opened && (await commit(opened.state)) ? opened : undefined;
      }),
    selectTab: (key: TabKey) => exclusive(() => commit(selectTab(state, key))),
    closeTab: (key: TabKey) => exclusive(() => commit(closeTab(state, key))),
    splitTab: (key: TabKey, direction: PaneDirection) =>
      exclusive(() => commit(splitTab(state, key, direction))),
    separateTab: (key: TabKey) =>
      exclusive(() => commit(separateTab(state, key))),
    moveToOwnWindow: (key: TabKey) =>
      exclusive(() => commit(moveToOwnWindow(state, key))),
    moveToMainWindow: (key: TabKey, select: boolean) =>
      exclusive(() => commit(moveToMainWindow(state, key, select))),
    setOwnWindowBounds: (key: TabKey, bounds: Rectangle) =>
      exclusive(() => commit(setOwnWindowBounds(state, key, bounds))),
    maximizePane: (key: TabKey, on: boolean) =>
      exclusive(() => commit(maximizePane(state, key, on))),
    resizeSplit: (profileId: string, split: Split) =>
      exclusive(() => commit(resizeSplit(state, profileId, split))),
    moveTab: (key: TabKey, before?: string) =>
      exclusive(() => commit(moveTab(state, key, before))),
    moveInBox: (key: TabKey, before?: string) =>
      exclusive(() => commit(moveInBox(state, key, before))),
    splitOntoTab: (key: TabKey, target: string) =>
      exclusive(() => commit(splitOntoTab(state, key, target))),
    dropInView: (key: TabKey, size: Size, point: { x: number; y: number }) =>
      exclusive(() => commit(dropInView(state, key, size, point))),
    closeOtherTabs: (key: TabKey) =>
      exclusive(() => commit(closeOtherTabs(state, key))),
    closeTabsBelow: (key: TabKey) =>
      exclusive(() => commit(closeTabsBelow(state, key))),
    setPinned: (key: TabKey, pinned: boolean) =>
      exclusive(() => commit(setPinned(state, key, pinned))),
    setOpenAtLaunch: (key: TabKey, on: boolean) =>
      exclusive(() => commit(setOpenAtLaunch(state, key, on))),
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
        if (!(await commit(removeProfile(state, profileId)))) {
          return false;
        }

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
        const added = addSavedSearch(state, profileId, { query, name }, newId);

        if ("refused" in added) {
          return added.refused;
        }

        await commit(added.state);

        return undefined;
      }),
    renameSavedSearch: (profileId: string, searchId: string, name: string) =>
      exclusive(() =>
        commit(renameSavedSearch(state, profileId, searchId, name))
      ),
    removeSavedSearch: (profileId: string, searchId: string) =>
      exclusive(() => commit(removeSavedSearch(state, profileId, searchId))),
    /**
     * Bookmarks the page in the profile, or removes its bookmark; says
     * whether it is bookmarked now, or nothing when nothing changed.
     */
    toggleBookmark: (profileId: string, page: BookmarkedPage) =>
      exclusive(async () => {
        const toggled = toggleBookmark(state, profileId, page, newId);

        return toggled && (await commit(toggled.state))
          ? toggled.bookmarked
          : undefined;
      }),
    removeBookmark: (profileId: string, id: string) =>
      exclusive(() => commit(removeBookmark(state, profileId, id))),
    /** Saves the change one returns; nothing for none. */
    change: (next: (current: State) => State | undefined) =>
      exclusive(() => commit(next(state))),
    /** On until `until`, `null` for until turned off, or off with `undefined`. */
    switchDoNotDisturb: (until: number | null | undefined) =>
      exclusive(() => commit(switchDoNotDisturb(state, until))),
    /**
     * Run once at startup, before any view exists: deletes the data of each
     * profile a removal did not finish clearing.
     */
    finishClears: () =>
      exclusive(() => settleClears(state.profilesToClear ?? [])),
  };
};

export type Profiles = ReturnType<typeof createProfiles>;
