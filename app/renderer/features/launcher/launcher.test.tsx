import { act } from "react";
import { describe, expect, it } from "vitest";

import type { Orientation } from "../../../core/records/layout.ts";
import { launcher } from "../../../shared/channels/launcher.ts";
import { profiles } from "../../../shared/channels/profiles.ts";
import { settings } from "../../../shared/channels/settings.ts";
import { stage } from "../../../shared/channels/stage.ts";
import {
  answer,
  groupOf,
  mountChrome,
  profileOf,
  settle,
  tabOf,
  typeInto,
} from "../../testing.tsx";
import { LauncherButton } from "./launcher-button.tsx";
import { Launcher } from "./launcher.tsx";

const PROFILES = {
  groups: [groupOf("g-mail", ["mail"])],
  profiles: [profileOf("personal")],
  newProfileRefusal: null,
  selectedProfileId: "personal",
  tabs: [tabOf("mail", "gmail")],
};

const input = () => document.querySelector<HTMLInputElement>("input");

const item = (appId: string) =>
  document.querySelector<HTMLElement>(`[data-app-id="${appId}"]`);

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

const mount = (appIds?: readonly string[], split?: Orientation) => {
  const page = mountChrome(<Launcher split={split} />, [
    answer(profiles.snapshot, PROFILES),
    answer(settings.snapshot, {
      layers: {
        global: appIds === undefined ? {} : { "launcher.apps": appIds },
        profiles: {},
      },
      locked: {},
    }),
    answer(stage.openTab, null),
  ]);
  return page;
};

describe(Launcher, () => {
  it("lists launcher.apps, narrowed as one types", () => {
    mount(["calendar", "drive", "docs"]);
    const all = names();
    typeInto(input(), "dr");
    expect([all, names()]).toStrictEqual([
      ["Calendar", "Drive", "Docs"],
      ["Drive"],
    ]);
  });

  it("leaves out Gmail, the single-instance app, even when launcher.apps names it", () => {
    mount(["gmail", "calendar"]);
    expect(names()).toStrictEqual(["Calendar"]);
  });

  it("asks main to open the highlighted app for the selected profile on Enter, then closes", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    key({ key: "Enter" });
    await settle();
    expect([
      sentOn(stage.openTab),
      sentOn(launcher.close).length,
    ]).toStrictEqual([[{ appId: "calendar", profileId: "personal" }], 1]);
  });

  it("opens an app on a click, split when Shift was held at the press", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    act(() => {
      item("calendar")?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, shiftKey: false })
      );
      item("calendar")?.click();
    });
    await settle();
    act(() => {
      item("drive")?.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, shiftKey: true })
      );
      item("drive")?.click();
    });
    await settle();
    expect(sentOn(stage.openTab)).toStrictEqual([
      { appId: "calendar", profileId: "personal" },
      { appId: "drive", profileId: "personal", split: "vertical" },
    ]);
  });

  it("says what a pick will do: open an app, or split the focused pane either way", () => {
    const placeholders = ([undefined, "vertical", "horizontal"] as const).map(
      (split) => {
        const { unmount } = mount(["calendar"], split);
        const placeholder = input()?.placeholder;
        unmount();
        return placeholder;
      }
    );
    expect(placeholders).toStrictEqual([
      "Open app",
      "Split vertically with…",
      "Split horizontally with…",
    ]);
  });

  it("splits the focused pane in the orientation it was opened for, on Enter as on Shift+Enter", async () => {
    const vertical = mount(["calendar", "drive"], "vertical");
    key({ key: "Enter" });
    await settle();
    vertical.unmount();
    const horizontal = mount(["calendar", "drive"], "horizontal");
    key({ key: "ArrowDown" });
    key({ key: "Enter", shiftKey: true });
    await settle();
    expect([
      vertical.sentOn(stage.openTab),
      horizontal.sentOn(stage.openTab),
      horizontal.sentOn(launcher.close).length,
    ]).toStrictEqual([
      [
        {
          appId: "calendar",
          profileId: "personal",
          split: "vertical",
        },
      ],
      [
        {
          appId: "drive",
          profileId: "personal",
          split: "horizontal",
        },
      ],
      1,
    ]);
  });

  it("draws the apps in a dialog over a backdrop, and closes on a click on the backdrop", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    const backdrop = document.querySelector<HTMLElement>(
      "[data-slot=dialog-overlay]"
    );
    expect([
      document.querySelector("[role=dialog] [data-app-id=calendar]") !== null,
      backdrop !== null,
    ]).toStrictEqual([true, true]);
    act(() => {
      for (const name of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
        backdrop?.dispatchEvent(
          new PointerEvent(name, { bubbles: true, button: 0 })
        );
      }
      backdrop?.click();
    });
    await settle();
    expect([sentOn(stage.openTab), sentOn(launcher.close)]).toStrictEqual([
      [],
      [{}],
    ]);
  });

  it("closes on Escape", async () => {
    const { sentOn } = mount(["calendar"]);
    key({ key: "Escape" });
    await settle();
    expect(sentOn(launcher.close)).toStrictEqual([{}]);
  });

  it("asks for a split on Shift+Enter, after moving down to the app", async () => {
    const { sentOn } = mount(["calendar", "drive"]);
    key({ key: "ArrowDown" });
    key({ key: "Enter", shiftKey: true });
    await settle();
    expect(sentOn(stage.openTab)).toStrictEqual([
      { appId: "drive", profileId: "personal", split: "vertical" },
    ]);
  });
});

describe(LauncherButton, () => {
  it("asks main to open the launcher on a click", () => {
    const page = mountChrome(<LauncherButton place="titlebar" />, []);
    act(() => {
      page.container.querySelector("button")?.click();
    });
    expect(page.sentOn(launcher.open)).toStrictEqual([{}]);
  });
});
