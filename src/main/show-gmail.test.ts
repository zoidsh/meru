import { noop } from "es-toolkit";
import { describe, expect, it } from "vitest";

import { recordInto } from "#core/log.fake.ts";
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
  // What happens while a profile is being selected.
  let meanwhile = noop;
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
      meanwhile();

      return fails ? Promise.reject(new Error("busy")) : Promise.resolve();
    },
    closeInbox: () => {
      calls.push(["closeInbox"]);
    },
    home: "https://mail.google.com/mail/u/0",
    log: recordInto(calls, {}, "log "),
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
    whileSelecting: (change: () => void) => {
      meanwhile = change;
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
    expect(failing.calls.at(-1)).toBe(
      "log profile-select-failed from=notification error=busy"
    );

    const gone = setup();

    gone.remove("b");

    await expect(gone.show.openMessage("b", "u")).resolves.toBeFalsy();
    expect(gone.calls).toStrictEqual([]);
  });

  it("leaves the inbox and answers false for a profile turned off while it was selected", async () => {
    const app = setup();

    app.whileSelecting(() => {
      app.disable("b");
    });

    await expect(app.show.openMessage("b", "u")).resolves.toBeFalsy();
    expect(app.calls).not.toContainEqual(["closeInbox"]);

    const jumped = setup();

    jumped.whileSelecting(() => {
      jumped.disable("b");
    });
    await jumped.show.jumpTo("b");

    expect(jumped.calls).toContainEqual(["selectProfile", "b"]);
    expect(jumped.calls).not.toContainEqual(["closeInbox"]);
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
