import { Mutex } from "es-toolkit";

import type { App } from "#core/apps.ts";
import {
  addProfile,
  forgetProfilesToClear,
  newProfile,
  nextProfileName,
  profilePartition,
  removeProfile,
  selectProfile,
  sortProfilesToClear,
} from "#core/state.ts";
import type { State } from "#core/state.ts";
import { closeTab, openTab, selectTab, updatePages } from "#core/tabs.ts";
import type { OpenedTab, PageUpdate, TabKey } from "#core/tabs.ts";

export interface ProfilesDeps {
  initial: State;
  save: (state: State) => Promise<void>;
  newId: () => string;
  /** The automatic name of the nth profile, in the person's language. */
  profileName: (n: number) => string;
  /** Deletes everything the session holds on disk. */
  clearSession: (partition: string) => Promise<void>;
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
  log,
}: ProfilesDeps) => {
  const mutex = new Mutex();
  const listeners = new Set<(state: State) => void>();
  let state = initial;

  const commit = async (next: State | undefined) => {
    if (!next) {
      return false;
    }

    await save(next);
    state = next;

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
    onChange: (listener: (state: State) => void) => {
      listeners.add(listener);
    },
    select: (profileId: string) =>
      exclusive(() => commit(selectProfile(state, profileId))),
    add: () =>
      exclusive(() =>
        commit(
          addProfile(
            state,
            newProfile(newId(), nextProfileName(state, profileName))
          )
        )
      ),
    /** Opens a link as a tab of `app`, selected; a new tab gets `tabId`. */
    openTab: (profileId: string, app: App, url: string, tabId: string) =>
      exclusive(async (): Promise<OpenedTab | undefined> => {
        const opened = openTab(state, profileId, app, url, () => tabId);

        return opened && (await commit(opened.state)) ? opened : undefined;
      }),
    selectTab: (key: TabKey) => exclusive(() => commit(selectTab(state, key))),
    closeTab: (key: TabKey) => exclusive(() => commit(closeTab(state, key))),
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
     * Run once at startup, before any view exists: deletes the data of each
     * profile a removal did not finish clearing.
     */
    finishClears: () =>
      exclusive(() => settleClears(state.profilesToClear ?? [])),
  };
};

export type Profiles = ReturnType<typeof createProfiles>;
