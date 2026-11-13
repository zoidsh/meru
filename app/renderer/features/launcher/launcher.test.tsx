import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  groupOf,
  mountChrome,
  profileOf,
  stageOf,
  tabOf,
} from "../../testing.tsx";
import { Launcher, LauncherButton } from "./launcher.tsx";

const mounted: (() => void)[] = [];

const ANCHOR = { height: 28, width: 28, x: 900, y: 6 };

const PROFILES = {
  groups: [groupOf("g-mail", ["mail"])],
  profiles: [profileOf("personal")],
  selectedProfileId: "personal",
  tabs: [tabOf("mail", "gmail")],
};

const input = () => document.querySelector<HTMLInputElement>("input");

const names = () =>
  [...document.querySelectorAll<HTMLElement>("[data-app-id]")].map(
    (entry) => entry.textContent
  );

const key = (init: KeyboardEventInit) => {
  act(() => {
    input()?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, ...init })
    );
  });
};

// React tracks an input's value through its own setter, so the value is set past it for the change to reach onChange.
const type = (text: string) => {
  const field = input();
  if (field === null) {
    return;
  }
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(field, text);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const mount = (appIds?: readonly string[]) => {
  const page = mountChrome(<Launcher anchor={ANCHOR} />, {
    "profiles.snapshot": PROFILES,
    "settings.snapshot": {
      global: appIds === undefined ? {} : { "launcher.apps": appIds },
      profiles: {},
    },
    "stage.snapshot": stageOf(),
    "tabs.add": tabOf("added", "calendar"),
    "tabs.focus": null,
  });
  mounted.push(page.unmount);
  return page;
};

describe(Launcher, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
  });

  it("lists launcher.apps, narrowed as one types", () => {
    mount(["calendar", "drive", "docs"]);
    const all = names();
    type("dr");
    expect([all, names()]).toStrictEqual([
      ["Calendar", "Drive", "Docs"],
      ["Drive"],
    ]);
  });

  it("adds a tab of the highlighted app in a group of its own on Enter and shows it, then closes", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    key({ key: "Enter" });
    await settle();
    expect([
      sentOn("tabs.add"),
      sentOn("tabs.focus"),
      sentOn("launcher.close").length,
    ]).toStrictEqual([
      [{ appId: "calendar", profileId: "personal" }],
      [{ tabId: "added" }],
      1,
    ]);
  });

  it("splits the focused pane with the app on Shift+Enter, after moving down to it", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    key({ key: "ArrowDown" });
    key({ key: "Enter", shiftKey: true });
    await settle();
    expect([sentOn("stage.split"), sentOn("tabs.add")]).toStrictEqual([
      [{ appId: "drive", orientation: "vertical" }],
      [],
    ]);
  });

  it("brings the profile's Gmail tab to the front rather than adding another", async () => {
    const { sentOn } = mount(["gmail"]);
    key({ key: "Enter", shiftKey: true });
    await settle();
    expect([sentOn("tabs.focus"), sentOn("stage.split")]).toStrictEqual([
      [{ tabId: "mail" }],
      [],
    ]);
  });
});

describe(LauncherButton, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
  });

  it("opens the launcher beside itself on a click and when launcher.open asks", () => {
    const page = mountChrome(<LauncherButton place="titlebar" />, {});
    mounted.push(page.unmount);
    act(() => {
      page.container.querySelector("button")?.click();
    });
    page.push("launcher.requested", {});
    expect(page.sentOn("launcher.open")).toHaveLength(2);
  });
});
