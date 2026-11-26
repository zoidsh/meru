import { describe, expect, it } from "vitest";

import {
  INITIAL_UPDATE_STATUS,
  channelOptions,
  nextUpdateStatus,
  releasePageUrl,
  updateCard,
  updateCardKey,
} from "./updates.ts";
import type { UpdateEvent, UpdateStatus } from "./updates.ts";

describe(channelOptions, () => {
  it("names the stable feed rather than leaving the channel unset", () => {
    expect(channelOptions("stable", "4.1.0")).toStrictEqual({
      channel: "latest",
      allowPrerelease: false,
      allowDowngrade: false,
    });
  });

  it("asks a stable build on Beta for prereleases, with nothing to downgrade", () => {
    expect(channelOptions("beta", "4.1.0")).toStrictEqual({
      channel: "beta",
      allowPrerelease: true,
      allowDowngrade: false,
    });
  });

  it("never downgrades a beta build while Beta is chosen", () => {
    expect(channelOptions("beta", "4.1.0-beta.2")).toStrictEqual({
      channel: "beta",
      allowPrerelease: true,
      allowDowngrade: false,
    });
  });

  it("downgrades a beta build onto the newest stable once Beta is left", () => {
    expect(channelOptions("stable", "4.1.0-beta.2")).toStrictEqual({
      channel: "latest",
      allowPrerelease: false,
      allowDowngrade: true,
    });
  });

  it("takes a build's metadata for no prerelease", () => {
    expect(channelOptions("stable", "4.1.0+build.7")).toStrictEqual(
      channelOptions("stable", "4.1.0")
    );
  });
});

const NOW = 1000;

const after = (
  events: UpdateEvent[],
  from: UpdateStatus = INITIAL_UPDATE_STATUS
) => {
  let status = from;
  let available: string | null = null;

  for (const event of events) {
    if (event.kind === "available") {
      available = event.version;
    }

    status = nextUpdateStatus(status, event, { now: NOW, available });
  }

  return status;
};

describe(nextUpdateStatus, () => {
  it("is checking while a check runs", () => {
    expect(after([{ kind: "checking" }])).toStrictEqual({
      status: "checking",
      version: null,
      lastChecked: null,
    });
  });

  it("is up to date when nothing newer is offered, with when it checked", () => {
    expect(
      after([{ kind: "checking" }, { kind: "notAvailable" }])
    ).toStrictEqual({ status: "upToDate", version: null, lastChecked: NOW });
  });

  it("downloads what is offered, then has it ready", () => {
    expect(
      after([{ kind: "checking" }, { kind: "available", version: "4.2.0" }])
    ).toStrictEqual({
      status: "downloading",
      version: "4.2.0",
      lastChecked: NOW,
    });
    expect(
      after([
        { kind: "available", version: "4.2.0" },
        { kind: "downloaded", version: "4.2.0" },
      ])
    ).toStrictEqual({ status: "ready", version: "4.2.0", lastChecked: NOW });
  });

  it("failed for an error that is not a signature's", () => {
    expect(
      after([{ kind: "checking" }, { kind: "error", signature: false }])
    ).toStrictEqual({ status: "failed", version: null, lastChecked: NOW });
  });

  it("unverified for a signature failure, naming the version offered", () => {
    expect(
      after([
        { kind: "available", version: "4.2.0" },
        { kind: "error", signature: true },
      ])
    ).toStrictEqual({
      status: "unverified",
      version: "4.2.0",
      lastChecked: NOW,
    });
  });

  it("failed for a signature failure with no version known", () => {
    expect(after([{ kind: "error", signature: true }]).status).toBe("failed");
  });

  const ready: UpdateStatus = {
    status: "ready",
    version: "4.2.0",
    lastChecked: 1,
  };

  it("stays ready through a later check offering the same version", () => {
    expect(
      after(
        [
          { kind: "checking" },
          { kind: "available", version: "4.2.0" },
          { kind: "downloaded", version: "4.2.0" },
        ],
        ready
      )
    ).toStrictEqual({ ...ready, lastChecked: NOW });
  });

  it("stays ready through a check that offers nothing or fails, since quit still installs it", () => {
    expect(
      after([{ kind: "checking" }, { kind: "notAvailable" }], ready)
    ).toStrictEqual({
      ...ready,
      lastChecked: NOW,
    });
    expect(
      after([{ kind: "checking" }, { kind: "error", signature: false }], ready)
    ).toStrictEqual(ready);
  });

  it("downloads a newer version offered while one is ready", () => {
    expect(
      after([{ kind: "available", version: "4.3.0" }], ready)
    ).toStrictEqual({
      status: "downloading",
      version: "4.3.0",
      lastChecked: NOW,
    });
  });
});

describe(releasePageUrl, () => {
  it("is the version's tag on Meru's releases", () => {
    expect(releasePageUrl("4.2.0")).toBe(
      "https://github.com/zoidsh/meru/releases/tag/v4.2.0"
    );
  });
});

const status = (
  name: UpdateStatus["status"],
  version: string | null = null
): UpdateStatus => ({ status: name, version, lastChecked: null });

/** The card each status in turn calls for, with Later or Close pressed where named. */
const cards = (steps: (UpdateStatus | "dismiss")[]) => {
  const dismissed = new Set<string>();
  const shown: (string | null)[] = [];
  let last: UpdateStatus = INITIAL_UPDATE_STATUS;

  for (const step of steps) {
    if (step === "dismiss") {
      const card = updateCard(last, dismissed);

      if (card) {
        dismissed.add(updateCardKey(card));
      }
    } else {
      last = step;
    }

    const card = updateCard(last, dismissed);

    shown.push(card ? `${card.card} ${card.version}` : null);
  }

  return shown;
};

describe(updateCard, () => {
  it("shows a ready version until Later, which keeps it away through later checks of it", () => {
    expect(
      cards([
        status("downloading", "4.2.0"),
        status("ready", "4.2.0"),
        "dismiss",
        status("ready", "4.2.0"),
      ])
    ).toStrictEqual([null, "ready 4.2.0", null, null]);
  });

  it("shows a newer version once it is ready, after Later on the one before", () => {
    expect(
      cards([
        status("ready", "4.2.0"),
        "dismiss",
        status("downloading", "4.2.1"),
        status("ready", "4.2.1"),
      ])
    ).toStrictEqual(["ready 4.2.0", null, null, "ready 4.2.1"]);
  });

  it("replaces a ready card with the unverified one, which Close puts away", () => {
    expect(
      cards([
        status("ready", "4.2.0"),
        status("unverified", "4.2.1"),
        "dismiss",
        status("unverified", "4.2.1"),
      ])
    ).toStrictEqual(["ready 4.2.0", "unverified 4.2.1", null, null]);
  });

  it("shows nothing while checking, up to date, failed or on a build that cannot update itself", () => {
    expect(
      cards([
        status("unsupported"),
        status("idle"),
        status("checking"),
        status("upToDate"),
        status("failed"),
      ])
    ).toStrictEqual([null, null, null, null, null]);
  });
});
