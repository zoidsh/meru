// Park and Miller's minimal standard generator: seeded, so a failing case is the same case on every run.
/** A draw from [0, 1) for each call, the same run of them for the same seed, which must be at least 1. */
export const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 48_271) % 2_147_483_647;
    return state / 2_147_483_647;
  };
};
