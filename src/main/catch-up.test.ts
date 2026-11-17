import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { CATCH_UP_INTERVAL, createCatchUp } from "./catch-up.ts";

const listing = (...ids: string[]): State => ({
  version: 1,
  profiles: ids.map((id) => newProfile(id, id)),
  selectedProfileId: ids[0] ?? "",
});

const setup = () => {
  const sent: string[] = [];

  return { catchUp: createCatchUp((profileId) => sent.push(profileId)), sent };
};

describe(createCatchUp, () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("catches a page up once for one request", async () => {
    const { catchUp, sent } = setup();

    catchUp.request("a");
    await vi.advanceTimersByTimeAsync(CATCH_UP_INTERVAL * 3);

    expect(sent).toStrictEqual(["a"]);
  });

  it("answers a burst at once and once more when 2 s are up", async () => {
    const { catchUp, sent } = setup();

    catchUp.request("a");
    catchUp.request("a");
    catchUp.request("a");

    expect(sent).toStrictEqual(["a"]);

    await vi.advanceTimersByTimeAsync(CATCH_UP_INTERVAL - 1);

    expect(sent).toStrictEqual(["a"]);

    await vi.advanceTimersByTimeAsync(1);

    expect(sent).toStrictEqual(["a", "a"]);

    await vi.advanceTimersByTimeAsync(CATCH_UP_INTERVAL * 3);

    expect(sent).toStrictEqual(["a", "a"]);
  });

  it("holds each profile to its own 2 s", () => {
    const { catchUp, sent } = setup();

    catchUp.request("a");
    catchUp.request("b");

    expect(sent).toStrictEqual(["a", "b"]);
  });

  it("asks for every listed profile on a wake", () => {
    const { catchUp, sent } = setup();

    catchUp.requestAll(listing("a", "b"));

    expect(sent).toStrictEqual(["a", "b"]);
  });

  it("drops a removed profile's pending catch-up", async () => {
    const { catchUp, sent } = setup();

    catchUp.request("a");
    catchUp.request("a");
    catchUp.follow(listing("b"));
    await vi.advanceTimersByTimeAsync(CATCH_UP_INTERVAL * 3);

    expect(sent).toStrictEqual(["a"]);
  });
});
