import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { launcher, launcherPushes } from "../../../shared/channels/launcher.ts";
import { profiles, tabOpening } from "../../../shared/channels/profiles.ts";
import { settings } from "../../../shared/channels/settings.ts";
import {
  answer,
  groupOf,
  mountChrome,
  profileOf,
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
  const page = mountChrome(<Launcher anchor={ANCHOR} />, [
    answer(profiles.snapshot, PROFILES),
    answer(settings.snapshot, {
      global: appIds === undefined ? {} : { "launcher.apps": appIds },
      profiles: {},
    }),
    answer(tabOpening.open, null),
  ]);
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

  it("asks main to open the highlighted app for the selected profile on Enter, then closes", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    key({ key: "Enter" });
    await settle();
    expect([
      sentOn(tabOpening.open),
      sentOn(launcher.close).length,
    ]).toStrictEqual([
      [{ appId: "calendar", profileId: "personal", split: false }],
      1,
    ]);
  });

  it("asks for a split on Shift+Enter, after moving down to the app", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    key({ key: "ArrowDown" });
    key({ key: "Enter", shiftKey: true });
    await settle();
    expect(sentOn(tabOpening.open)).toStrictEqual([
      { appId: "drive", profileId: "personal", split: true },
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
    const page = mountChrome(<LauncherButton place="titlebar" />, []);
    mounted.push(page.unmount);
    act(() => {
      page.container.querySelector("button")?.click();
    });
    page.push(launcherPushes.requested, {});
    expect(page.sentOn(launcher.open)).toHaveLength(2);
  });
});
