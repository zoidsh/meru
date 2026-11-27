import { describe, expect, it } from "vitest";

import type { BlockAsk } from "#core/blocker.ts";
import type { Capability } from "#core/entitlement.ts";
import { silentLog } from "#core/log.fake.ts";
import type { Settings } from "#core/settings.ts";
import { SIGN_IN_ORIGINS } from "#core/window-open.ts";
import type { RequestBlocker } from "#platform/requests.ts";

import { createContentBlocker } from "./content-blocker.ts";
import { createSettingsStore } from "./settings.ts";

const AD = {
  url: "https://ad.doubleclick.net/pagead/x",
  resourceType: "image",
};
const TRACKER = {
  url: "https://www.google-analytics.com/g/collect",
  resourceType: "script",
};
const SIGN_IN = {
  url: "https://accounts.google.com/gen_204?x",
  resourceType: "image",
};

/** A session per partition holding what the blocker last set on it. */
const fakeRequests = () => {
  const filters = new Map<string, ((ask: BlockAsk) => boolean) | undefined>();
  const sets: string[] = [];
  const requests: RequestBlocker = {
    block: (partition, blocks) => {
      filters.set(partition, blocks);
      sets.push(partition);
    },
  };
  /** What the partition's session does to each request, or `unhooked`. */
  const outcome = (partition: string, ask: BlockAsk) => {
    const blocks = filters.get(partition);

    if (!blocks) {
      return "unhooked";
    }

    return blocks(ask) ? "blocked" : "allowed";
  };

  return { requests, sets, outcome };
};

const setup = (
  initial?: Settings,
  can?: (capability: Capability) => boolean
) => {
  const fake = fakeRequests();
  const settings = createSettingsStore({
    initial: initial ?? { version: 1 },
    save: () => Promise.resolve(),
    platform: "darwin",
    log: silentLog,
    ...(can ? { can } : {}),
  });
  const blocker = createContentBlocker({
    requests: fake.requests,
    settings,
    protectedOrigins: SIGN_IN_ORIGINS,
  });

  return { ...fake, settings, blocker };
};

describe(createContentBlocker, () => {
  it("blocks ads and trackers by default in a profile's session, never sign-in", () => {
    const { blocker, outcome } = setup();

    blocker.prepare("persist:a");

    expect(
      [AD, TRACKER, SIGN_IN].map((ask) => outcome("persist:a", ask))
    ).toStrictEqual(["blocked", "blocked", "allowed"]);
  });

  it("follows each switch on its own, in sessions prepared before and after the change", async () => {
    const { blocker, settings, outcome } = setup();

    blocker.prepare("persist:a");
    await settings.update("blockAds", () => false);
    blocker.prepare("persist:b");

    expect(
      ["persist:a", "persist:b"].map((partition) => [
        outcome(partition, AD),
        outcome(partition, TRACKER),
      ])
    ).toStrictEqual([
      ["allowed", "blocked"],
      ["allowed", "blocked"],
    ]);

    await settings.update("blockAds", () => true);
    await settings.update("blockTrackers", () => false);

    expect([
      outcome("persist:a", AD),
      outcome("persist:a", TRACKER),
    ]).toStrictEqual(["blocked", "allowed"]);
  });

  it("takes its hook off every session when both are off, and puts it back", async () => {
    const { blocker, settings, outcome } = setup({
      version: 1,
      blockAds: false,
      blockTrackers: false,
    });

    blocker.prepare("persist:a");

    expect(outcome("persist:a", AD)).toBe("unhooked");

    await settings.update("blockTrackers", () => true);

    expect([
      outcome("persist:a", AD),
      outcome("persist:a", TRACKER),
    ]).toStrictEqual(["allowed", "blocked"]);

    await settings.update("blockTrackers", () => false);

    expect(outcome("persist:a", TRACKER)).toBe("unhooked");
  });

  it("hooks a session once however many of its views are prepared, and only sessions prepared", () => {
    const { blocker, sets } = setup();

    blocker.prepare("persist:a");
    blocker.prepare("persist:a");
    blocker.prepare("persist:b");

    expect(sets).toStrictEqual(["persist:a", "persist:b"]);
  });

  it("hooks no session without Meru Pro, whatever is stored, and blocks from the next request once a license arrives", () => {
    let licensed = false;
    const { blocker, settings, outcome } = setup(
      { version: 1, blockAds: true, blockTrackers: true },
      (capability) => licensed || capability !== "blocker"
    );

    blocker.prepare("persist:a");

    expect([
      outcome("persist:a", AD),
      outcome("persist:a", TRACKER),
    ]).toStrictEqual(["unhooked", "unhooked"]);

    licensed = true;
    settings.recheck();
    blocker.prepare("persist:b");

    expect(
      ["persist:a", "persist:b"].map((partition) => [
        outcome(partition, AD),
        outcome(partition, TRACKER),
      ])
    ).toStrictEqual([
      ["blocked", "blocked"],
      ["blocked", "blocked"],
    ]);
  });
});
