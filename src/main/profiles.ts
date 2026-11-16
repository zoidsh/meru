import { Mutex } from "es-toolkit";

import {
  addProfile,
  nextProfileName,
  profilePartition,
  removeProfile,
  selectProfile,
} from "#core/state.ts";
import type { State } from "#core/state.ts";

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
          addProfile(state, {
            id: newId(),
            name: nextProfileName(state, profileName),
          })
        )
      ),
    /**
     * Lists the profile no more, which closes its view, and then deletes its
     * data, so data is never gone for a profile still listed. A clear that
     * fails is logged with where the data is left.
     */
    remove: (profileId: string) =>
      exclusive(async () => {
        if (!(await commit(removeProfile(state, profileId)))) {
          return false;
        }

        const partition = profilePartition(profileId);

        try {
          await clearSession(partition);
        } catch (error) {
          log(
            `Removed profile ${profileId}, but its data in ${partition} was not deleted: ${describe(error)}`
          );
        }

        return true;
      }),
  };
};

export type Profiles = ReturnType<typeof createProfiles>;
