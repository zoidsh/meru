import { describe, expect, it } from "vitest";

import type { UpdaterEvent } from "../ports.ts";
import { advance, IDLE_UPDATE } from "./update.ts";

const run = (...events: readonly UpdaterEvent[]) => {
  let state = IDLE_UPDATE;
  for (const event of events) {
    state = advance(state, event);
  }
  return state;
};

describe(advance, () => {
  it("follows a check through a download to an update ready to install", () => {
    expect([
      run({ kind: "checking" }),
      run({ kind: "checking" }, { kind: "notAvailable" }),
      run({ kind: "available", version: "4.0.1" }),
      run({ kind: "progress", percent: 140 }),
      run({ kind: "progress", percent: -3 }),
      run({ kind: "downloaded", version: "4.0.1" }),
    ]).toStrictEqual([
      { kind: "checking" },
      { kind: "idle" },
      { kind: "available", version: "4.0.1" },
      { kind: "downloading", percent: 100 },
      { kind: "downloading", percent: 0 },
      { kind: "ready", version: "4.0.1" },
    ]);
  });

  it("reports an error, but keeps an update that is ready", () => {
    const failed: UpdaterEvent = { kind: "error", message: "offline" };
    expect([
      run({ kind: "checking" }, failed),
      run({ kind: "downloaded", version: "4.0.1" }, failed),
    ]).toStrictEqual([
      { kind: "error", message: "offline" },
      { kind: "ready", version: "4.0.1" },
    ]);
  });
});
