import { describe, expect, it } from "vitest";

import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createShowGmail } from "./show-gmail.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Home"), newProfile("b", "Work")],
  selectedProfileId: "a",
};

const setup = ({ fails = false } = {}) => {
  let state = two;
  const calls: unknown[] = [];
  const show = createShowGmail({
    state: () => state,
    openInGmailTab: (profileId, url) => {
      calls.push(["open", profileId, url]);

      return Promise.resolve();
    },
    selectTab: (key) => {
      calls.push(["selectTab", key]);

      return Promise.resolve();
    },
    selectProfile: (profileId) => {
      calls.push(["selectProfile", profileId]);

      return fails ? Promise.reject(new Error("busy")) : Promise.resolve();
    },
    closeInbox: () => {
      calls.push(["closeInbox"]);
    },
    home: "https://mail.google.com/mail/u/0",
    log: (message) => {
      calls.push(["log", message]);
    },
  });

  return {
    show,
    calls,
    closeGmail: (profileId: string) => {
      state = {
        ...state,
        profiles: state.profiles.map((profile) =>
          profile.id === profileId
            ? { ...profile, tabs: [], selectedTabId: "" }
            : profile
        ),
      };
    },
    disable: (profileId: string) => {
      state = {
        ...state,
        profiles: state.profiles.map((profile) =>
          profile.id === profileId ? { ...profile, disabled: true } : profile
        ),
      };
    },
    remove: (profileId: string) => {
      state = {
        ...state,
        profiles: state.profiles.filter((profile) => profile.id !== profileId),
      };
    },
  };
};

describe(createShowGmail, () => {
  it("opens a message in the profile's Gmail, selects the profile and closes the inbox, the profile selected already included", async () => {
    const app = setup();

    await expect(
      app.show.openMessage("a", "https://mail.google.com/x")
    ).resolves.toBeTruthy();
    expect(app.calls).toStrictEqual([
      ["open", "a", "https://mail.google.com/x"],
      ["selectProfile", "a"],
      ["closeInbox"],
    ]);
  });

  it("answers false and leaves the inbox for a profile not selected or gone", async () => {
    const failing = setup({ fails: true });

    await expect(failing.show.openMessage("a", "u")).resolves.toBeFalsy();
    expect(failing.calls.at(-1)).toStrictEqual([
      "log",
      "A message's profile was not selected: Error: busy",
    ]);

    const gone = setup();

    gone.remove("b");

    await expect(gone.show.openMessage("b", "u")).resolves.toBeFalsy();
    expect(gone.calls).toStrictEqual([]);
  });

  it("leaves a profile turned off as it was, opening and selecting nothing", async () => {
    const app = setup();

    app.disable("b");

    await expect(app.show.openMessage("b", "u")).resolves.toBeFalsy();
    await app.show.jumpTo("b");

    expect(app.calls).toStrictEqual([]);
  });

  it("jumps to a profile's Gmail tab before the profile, then closes the inbox", async () => {
    const app = setup();

    await app.show.jumpTo("a");

    expect(app.calls).toStrictEqual([
      ["selectTab", { profileId: "a", tabId: "gmail" }],
      ["selectProfile", "a"],
      ["closeInbox"],
    ]);
  });

  it("opens Gmail at its home in a profile where it was closed, before selecting the profile", async () => {
    const app = setup();

    app.closeGmail("b");
    await app.show.jumpTo("b");

    expect(app.calls).toStrictEqual([
      ["open", "b", "https://mail.google.com/mail/u/0"],
      ["selectProfile", "b"],
      ["closeInbox"],
    ]);
  });

  it("does nothing when the profile jumped to is gone", async () => {
    const app = setup();

    app.remove("b");
    await app.show.jumpTo("b");

    expect(app.calls).toStrictEqual([]);
  });
});
