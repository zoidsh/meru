import { Mutex } from "es-toolkit";

import type { PaneGapEnd, PaneTree, Split } from "#core/pane-tree.ts";
import {
  evenedSplit,
  gapTravel,
  resizedSplit,
  splitPanes,
} from "#core/split.ts";
import { selectedProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { Size } from "#core/window-bounds.ts";

export interface PaneResizeDeps {
  state: () => State;
  resizeSplit: (profileId: string, split: Split) => Promise<unknown>;
  /** The page area's size, which the panes share. */
  areaSize: () => Size;
  /** Places the panes as a tree until `undefined` places them as stored. */
  preview: (tree: PaneTree | undefined) => void;
  log: (message: string) => void;
}

/** A move of the gap where the panes of `before` and `after` part. */
export interface PaneResize {
  before: string;
  after: string;
  /** Pixels along the split since the gesture began, toward `after`. */
  by: number;
  /**
   * In place of `by`, as Home and End ask: the length before the gap at its
   * least or most, measured from the split as stored.
   */
  to?: PaneGapEnd | undefined;
  /** Names the gesture; a new one starts from the split as stored. */
  gesture: number;
  /** The last move of the gesture, whose result is stored. */
  done: boolean;
}

/**
 * Resizes the selected profile's panes as the shell drags or steps a gap.
 * Every move of one gesture starts from the split as it was stored when the
 * gesture began, so a move the minimum stopped loses nothing, and only the
 * last is stored; the moves between only place the views. One at a time, so
 * a gesture begun as the last one is stored, as key presses in a row are,
 * starts from what that stored.
 */
export const createPaneResize = ({
  state,
  resizeSplit,
  areaSize,
  preview,
  log,
}: PaneResizeDeps) => {
  const mutex = new Mutex();
  let gesture: { id: number; profileId: string; base: Split } | undefined;

  const oneAtATime = async (work: () => Promise<void>) => {
    await mutex.acquire();

    try {
      await work();
    } finally {
      mutex.release();
    }
  };

  const resize = async ({
    before,
    after,
    by,
    to,
    gesture: id,
    done,
  }: PaneResize) => {
    const profile = selectedProfile(state());

    if (gesture?.id !== id || gesture.profileId !== profile.id) {
      gesture = profile.split && {
        id,
        profileId: profile.id,
        base: profile.split,
      };
    }

    const { base } = gesture ?? {};
    const travel =
      base && to ? gapTravel(profile, base, areaSize(), before, after, to) : by;
    const next =
      base &&
      travel !== undefined &&
      resizedSplit(profile, base, areaSize(), before, after, travel);

    if (!next) {
      log(`Refused to resize the panes at ${before}|${after}`);
      gesture = undefined;
      preview(undefined);

      return;
    }

    if (!done) {
      preview(splitPanes({ ...profile, split: next }));

      return;
    }

    gesture = undefined;

    try {
      // A press that moved nothing stores nothing.
      if (next !== base) {
        await resizeSplit(profile.id, next);
      }
    } finally {
      preview(undefined);
    }
  };

  const evenOut = async ({
    before,
    after,
  }: Pick<PaneResize, "before" | "after">) => {
    const profile = selectedProfile(state());

    if (!splitPanes(profile) || !profile.split) {
      log(`Refused to even out the panes at ${before}|${after}`);

      return;
    }

    await resizeSplit(profile.id, evenedSplit(profile.split, before, after));
  };

  return {
    resize: (move: PaneResize) => oneAtATime(() => resize(move)),
    /** Gives the split where the two part equal shares, and stores it. */
    evenOut: (gap: Pick<PaneResize, "before" | "after">) =>
      oneAtATime(() => evenOut(gap)),
    /**
     * Ends a drag that will send no release, as when the shell's page loads
     * anew or its process goes: the panes go back to their stored sizes.
     */
    cancel: () => {
      gesture = undefined;
      preview(undefined);
    },
  };
};

export type PaneResizer = ReturnType<typeof createPaneResize>;
