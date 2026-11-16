import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { COMMANDS, commandsFor } from "./commands.ts";
import type { Command, CommandActions, CommandContext } from "./commands.ts";
import { createProfiles } from "./profiles.ts";
import { createSettingsStore } from "./settings.ts";

const twoProfiles: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "Week" }],
    },
    newProfile("b", "Profile 2"),
  ],
  selectedProfileId: "a",
};

const commandOf = (id: string) =>
  COMMANDS.find((candidate) => candidate.id === id) as Command;

/** The real profiles and settings, saving nowhere, behind the actions. */
const setup = (initial: State = twoProfiles) => {
  const profiles = createProfiles({
    initial,
    save: () => Promise.resolve(),
    newId: () => "new",
    profileName: (n) => `Profile ${n}`,
    clearSession: () => Promise.resolve(),
    log: () => false,
  });
  const settings = createSettingsStore({
    initial: { version: 1 },
    save: () => Promise.resolve(),
    log: () => false,
  });
  let reloads = 0;
  const actions: CommandActions = {
    setSetting: settings.set,
    reloadSelectedTab: () => {
      reloads += 1;
    },
    selectTab: profiles.selectTab,
    closeTab: profiles.closeTab,
    selectProfile: profiles.select,
    addProfile: profiles.add,
  };
  const context = (): CommandContext => ({
    state: profiles.get(),
    setting: settings.get,
  });

  return {
    profiles,
    settings,
    reloads: () => reloads,
    isAvailable: (id: string) => commandOf(id).isAvailable?.(context()) ?? true,
    isChecked: (id: string) => commandOf(id).isChecked?.(context()),
    run: (id: string) => commandOf(id).run(context(), actions),
  };
};

const selected = (state: State) => {
  const profile = state.profiles.find(
    (candidate) => candidate.id === state.selectedProfileId
  );

  return [state.selectedProfileId, profile?.selectedTabId];
};

describe("the command registry", () => {
  it("gives every command an id of its own and a title", () => {
    const ids = COMMANDS.map((command) => command.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const command of COMMANDS) {
      expect(command.title()).not.toBe("");
    }
  });

  it("checks the design in use and switches it", async () => {
    const app = setup();

    expect([
      app.isChecked("design.modern"),
      app.isChecked("design.classic"),
    ]).toStrictEqual([true, false]);

    await app.run("design.classic");

    expect(app.settings.get("design")).toBe("classic");
    expect([
      app.isChecked("design.modern"),
      app.isChecked("design.classic"),
    ]).toStrictEqual([false, true]);
  });

  it("toggles vibrancy, checked while it is on", async () => {
    const app = setup();

    expect(app.isChecked("vibrancy.toggle")).toBeTruthy();

    await app.run("vibrancy.toggle");

    expect(app.settings.get("vibrancy")).toBeFalsy();
    expect(app.isChecked("vibrancy.toggle")).toBeFalsy();
  });

  it("closes the selected tab, but never Gmail's", async () => {
    const app = setup();

    expect(app.isAvailable("tab.close")).toBeFalsy();

    await app.run("tab.close");
    await app.run("tab.next");

    expect(app.isAvailable("tab.close")).toBeTruthy();

    await app.run("tab.close");

    expect(app.profiles.get().profiles[0]?.tabs).toStrictEqual([gmailTab()]);
  });

  it("selects the next and previous tab and profile, wrapping round", async () => {
    const app = setup();

    await app.run("tab.next");
    expect(selected(app.profiles.get())).toStrictEqual(["a", "c1"]);
    await app.run("tab.next");
    expect(selected(app.profiles.get())).toStrictEqual(["a", "gmail"]);
    await app.run("tab.previous");
    expect(selected(app.profiles.get())).toStrictEqual(["a", "c1"]);

    await app.run("profile.previous");
    expect(app.profiles.get().selectedProfileId).toBe("b");
    await app.run("profile.next");
    expect(app.profiles.get().selectedProfileId).toBe("a");
  });

  it("offers the next tab or profile only when there is another", async () => {
    const app = setup({
      version: 1,
      profiles: [newProfile("a", "Default")],
      selectedProfileId: "a",
    });

    for (const id of [
      "tab.next",
      "tab.previous",
      "profile.next",
      "profile.previous",
    ]) {
      expect(app.isAvailable(id)).toBeFalsy();
    }

    await app.run("profile.add");

    expect(app.profiles.get().profiles).toHaveLength(2);
    expect(app.isAvailable("profile.next")).toBeTruthy();
  });

  it("reloads the selected tab", async () => {
    const app = setup();

    await app.run("tab.reload");

    expect(app.reloads()).toBe(1);
  });
});

const hasVibrancy = (platform: "darwin" | "win32" | "linux") =>
  commandsFor(platform).some((command) => command.id === "vibrancy.toggle");

describe(commandsFor, () => {
  it("has the vibrancy command on macOS alone", () => {
    expect([
      hasVibrancy("darwin"),
      hasVibrancy("win32"),
      hasVibrancy("linux"),
    ]).toStrictEqual([true, false, false]);
  });
});
