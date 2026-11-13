import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

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
  tabOf,
} from "../../testing.tsx";
import { LauncherButton } from "./launcher-button.tsx";
import { Launcher } from "./launcher.tsx";

const mounted: (() => void)[] = [];

const PROFILES = {
  groups: [groupOf("g-mail", ["mail"])],
  profiles: [profileOf("personal")],
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

const mount = (appIds?: readonly string[], split?: Orientation) => {
  const page = mountChrome(<Launcher split={split} />, [
    answer(profiles.snapshot, PROFILES),
    answer(settings.snapshot, {
      global: appIds === undefined ? {} : { "launcher.apps": appIds },
      profiles: {},
    }),
    answer(stage.openTab, null),
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
    ]).toStrictEqual([
      [{ appId: "calendar", profileId: "personal", split: false }],
      1,
    ]);
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
      { appId: "calendar", profileId: "personal", split: false },
      { appId: "drive", profileId: "personal", split: true },
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
          orientation: "vertical",
          profileId: "personal",
          split: true,
        },
      ],
      [
        {
          appId: "drive",
          orientation: "horizontal",
          profileId: "personal",
          split: true,
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

  it("asks main to open the launcher on a click", () => {
    const page = mountChrome(<LauncherButton place="titlebar" />, []);
    mounted.push(page.unmount);
    act(() => {
      page.container.querySelector("button")?.click();
    });
    expect(page.sentOn(launcher.open)).toStrictEqual([{}]);
  });
});
