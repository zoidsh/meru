import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "#core/state.ts";
import type { State, Tab } from "#core/state.ts";

import { createSidebar } from "./sidebar.ts";

const withTabs = (tabs: Tab[], selectedProfileId = "a"): State => ({
  version: 1,
  profiles: [{ ...newProfile("a", "Default"), tabs }, newProfile("b", "Work")],
  selectedProfileId,
});

const calendar = { id: "c1", app: "calendar", url: "", title: "" };

const setup = (initial: State) => {
  let state = initial;
  const listeners: ((next: State) => void)[] = [];
  const sidebar = createSidebar({
    profiles: {
      get: () => state,
      onChange: (listener) => {
        listeners.push(listener);
      },
    },
  });
  let heard = 0;

  sidebar.onChange(() => {
    heard += 1;
  });

  return {
    sidebar,
    heard: () => heard,
    set: (next: State) => {
      state = next;

      for (const listener of listeners) {
        listener(next);
      }
    },
  };
};

describe(createSidebar, () => {
  it("follows the selected profile's tabs, and tells only of a change", () => {
    const window = setup(withTabs([gmailTab()]));

    expect(window.sidebar.current()).toBe("hidden");

    window.set(withTabs([gmailTab(), calendar]));

    expect([window.sidebar.current(), window.heard()]).toStrictEqual([
      "narrow",
      1,
    ]);

    window.set(withTabs([calendar, gmailTab()]));

    expect(window.heard()).toBe(1);
  });

  it("keeps a choice made by hand until a tab opens or closes", () => {
    const window = setup(withTabs([gmailTab(), calendar]));

    window.sidebar.toggleWidth();
    expect(window.sidebar.current()).toBe("wide");

    window.sidebar.toggleShown();
    expect(window.sidebar.current()).toBe("hidden");

    window.sidebar.toggleShown();
    expect(window.sidebar.current()).toBe("wide");

    window.set(withTabs([{ ...calendar, title: "Week" }, gmailTab()]));
    expect(window.sidebar.current()).toBe("wide");

    window.set(withTabs([gmailTab()]));
    expect([window.sidebar.current(), window.heard()]).toStrictEqual([
      "hidden",
      4,
    ]);
  });

  it("drops a choice made by hand when another profile is selected", () => {
    const window = setup(withTabs([gmailTab()]));

    window.sidebar.toggleShown();
    expect(window.sidebar.current()).toBe("narrow");

    window.set(withTabs([gmailTab()], "b"));
    window.set(withTabs([gmailTab()], "a"));

    expect(window.sidebar.current()).toBe("hidden");
  });
});
