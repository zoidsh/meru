import { delay } from "es-toolkit";
import { describe, expect, it } from "vitest";

import type { Platform } from "#core/platform.ts";
import { createInitialSettings, readSetting } from "#core/settings.ts";
import type { SettingKey, SettingValue } from "#core/settings.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TrayFactory, TrayMenuItem } from "#platform/tray.ts";

import { createTray } from "./tray.ts";

/** One fake icon at a time, as the app has. */
const createFakeTrays = () => {
  const events: string[] = [];
  let current:
    | {
        image: string;
        title: string;
        toolTip: string;
        contextMenu: readonly TrayMenuItem[] | undefined;
        popped: readonly TrayMenuItem[] | undefined;
        click?: () => void;
        rightClick?: () => void;
      }
    | undefined;

  const trays: TrayFactory = {
    create: (image) => {
      const icon = {
        image,
        title: "",
        toolTip: "",
        contextMenu: undefined as readonly TrayMenuItem[] | undefined,
        popped: undefined as readonly TrayMenuItem[] | undefined,
      } as NonNullable<typeof current>;

      current = icon;
      events.push("create");

      return {
        setImage: (name) => {
          icon.image = name;
        },
        setTitle: (title) => {
          icon.title = title;
        },
        setToolTip: (text) => {
          icon.toolTip = text;
        },
        setContextMenu: (items) => {
          events.push("setContextMenu");
          icon.contextMenu = items;
        },
        popUpMenu: (items) => {
          icon.popped = items;
        },
        onClick: (listener) => {
          icon.click = listener;
        },
        onRightClick: (listener) => {
          icon.rightClick = listener;
        },
        destroy: () => {
          events.push("destroy");
          current = undefined;
        },
      };
    },
  };

  return { trays, events, icon: () => current };
};

const labels = (items: readonly TrayMenuItem[] | undefined) =>
  items?.map((item) => (item.kind === "item" ? item.label : "-"));

const clickLabel = (
  items: readonly TrayMenuItem[] | undefined,
  label: string
) => {
  const item = items?.find(
    (candidate) => candidate.kind === "item" && candidate.label === label
  );

  if (item?.kind !== "item") {
    throw new Error(`No item ${label}`);
  }

  item.click();
};

const stateOf = (...names: string[]): State => {
  const profiles = names.map((name, index) => ({
    ...newProfile(`p${index}`, name),
    tabs: [{ ...gmailTab(), id: "mail" }],
    selectedTabId: "mail",
  }));

  return {
    version: 1,
    profiles,
    selectedProfileId: profiles[0]?.id ?? "",
  };
};

const setup = ({
  platform = "darwin" as Platform,
  names = ["Home", "Work"],
  disabled = [] as string[],
  settings = {} as Record<string, unknown>,
} = {}) => {
  const fake = createFakeTrays();
  const counts = new Map<string, number | null>();
  const calls: string[] = [];
  const values = { ...createInitialSettings(), tray: true, ...settings };
  let visible = true;
  let minimized = false;
  let dark = false;

  const tray = createTray({
    trays: fake.trays,
    platform,
    productName: "Meru",
    setting: <Key extends SettingKey>(key: Key): SettingValue<Key> =>
      readSetting(values, key, platform),
    isDark: () => dark,
    state: () => {
      const state = stateOf(...names);

      return {
        ...state,
        profiles: state.profiles.map((profile) =>
          disabled.includes(profile.id)
            ? { ...profile, disabled: true }
            : profile
        ),
      };
    },
    unread: (profileId) => counts.get(profileId) ?? null,
    window: {
      isVisible: () => visible,
      isMinimized: () => minimized,
      hide: () => {
        calls.push("hide");
        visible = false;
      },
    },
    reveal: (profileId) => {
      calls.push(profileId === undefined ? "reveal" : `reveal ${profileId}`);
      visible = true;
      minimized = false;
    },
    jumpTo: (profileId) => {
      calls.push(`jump ${profileId}`);

      return Promise.resolve();
    },
    quit: () => {
      calls.push("quit");
    },
    log: () => false,
  });

  return {
    ...fake,
    tray,
    calls,
    count: (profileId: string, count: number | null) => {
      counts.set(profileId, count);
      tray.update();
    },
    set: (key: string, value: unknown) => {
      Reflect.set(values, key, value);
      tray.update();
    },
    setVisible: (next: boolean) => {
      visible = next;
      tray.update();
    },
    minimize: () => {
      minimized = true;
      tray.update();
    },
    setDark: (next: boolean) => {
      dark = next;
      tray.update();
    },
  };
};

/** Lets a jump, which awaits the profile's selection, finish. */
const settle = () => delay(0);

describe(createTray, () => {
  it("shows no icon while the setting is off, and comes and goes with it", () => {
    const app = setup({ settings: { tray: false } });

    app.tray.update();

    expect(app.icon()).toBeUndefined();
    expect(app.tray.isShown()).toBeFalsy();

    app.set("tray", true);

    expect(app.icon()?.toolTip).toBe("Meru");
    expect(app.tray.isShown()).toBeTruthy();

    app.set("tray", false);

    expect(app.events).toStrictEqual(["create", "destroy"]);
  });

  it("puts the total beside the macOS menu bar icon, in full, and clears it at zero", () => {
    const app = setup();

    app.tray.update();
    app.count("p0", 120);
    app.count("p1", 3);

    expect(app.icon()?.image).toBe("IconMenuBarTemplate.png");
    expect(app.icon()?.title).toBe("123");

    app.count("p0", 0);
    app.count("p1", null);

    expect(app.icon()?.title).toBe("");
  });

  it("leaves the title out when the count beside the icon is turned off", () => {
    const app = setup({ settings: { trayUnreadCount: false } });

    app.count("p0", 4);

    expect(app.icon()?.title).toBe("");
  });

  it("swaps the image for unread mail on Windows and follows the theme", () => {
    const app = setup({ platform: "win32" });

    app.tray.update();

    expect(app.icon()?.image).toBe("IconTray-Dark.ico");

    app.count("p1", 2);

    expect(app.icon()?.image).toBe("IconTrayUnread-Dark.ico");

    app.setDark(true);

    expect(app.icon()?.image).toBe("IconTrayUnread-Light.ico");

    app.set("trayIconColor", "dark");

    expect(app.icon()?.image).toBe("IconTrayUnread-Dark.ico");
  });

  it("pops up a menu built as it opens on a right click on macOS and Windows", () => {
    for (const platform of ["darwin", "win32"] as const) {
      const app = setup({ platform });

      app.tray.update();

      expect(app.icon()?.contextMenu).toBeUndefined();

      app.count("p1", 150);
      app.icon()?.rightClick?.();

      expect(labels(app.icon()?.popped)).toStrictEqual([
        "Home",
        "Work (99+)",
        "-",
        "Hide Meru",
        "-",
        platform === "darwin" ? "Quit Meru" : "Exit",
      ]);
    }
  });

  it("sets the menu on the icon on Linux, again only when it changes", () => {
    const app = setup({ platform: "linux", names: ["Home"] });

    app.tray.update();

    expect(labels(app.icon()?.contextMenu)).toStrictEqual([
      "Home",
      "-",
      "Hide Meru",
      "-",
      "Quit",
    ]);

    app.tray.update();
    app.setVisible(false);

    expect(labels(app.icon()?.contextMenu)).toStrictEqual([
      "Home",
      "-",
      "Show Meru",
      "-",
      "Quit",
    ]);
    expect(
      app.events.filter((event) => event === "setContextMenu")
    ).toHaveLength(2);
  });

  it("shows a profile's name as text on Windows and Linux", () => {
    const app = setup({ platform: "linux", names: ["R&D"] });

    app.count("p0", 2);

    expect(labels(app.icon()?.contextMenu)?.[0]).toBe("R&&D (2)");
  });

  it("leaves a profile turned off out of its menu", () => {
    const app = setup({
      platform: "linux",
      names: ["Home", "Work", "Club"],
      disabled: ["p1"],
    });

    app.tray.update();

    expect(
      labels(app.icon()?.contextMenu)?.filter((label) =>
        ["Home", "Work", "Club"].includes(label)
      )
    ).toStrictEqual(["Home", "Club"]);
  });

  it("jumps to a profile from its item and reveals the window", async () => {
    const app = setup({ platform: "linux" });

    app.setVisible(false);
    clickLabel(app.icon()?.contextMenu, "Work");
    await settle();

    expect(app.calls).toStrictEqual(["jump p1", "reveal p1"]);
  });

  it("hides a shown window and reveals a hidden one from its toggle and its click", () => {
    const app = setup();

    app.tray.update();
    app.icon()?.click?.();

    expect(app.calls).toStrictEqual(["hide"]);

    app.icon()?.rightClick?.();
    clickLabel(app.icon()?.popped, "Show Meru");

    expect(app.calls).toStrictEqual(["hide", "reveal"]);
  });

  it("reveals the window as it was on a click, or first jumps to unread mail when asked to", async () => {
    const plain = setup();

    plain.setVisible(false);
    plain.count("p1", 1);
    plain.icon()?.click?.();
    await settle();

    expect(plain.calls).toStrictEqual(["reveal"]);

    const jumping = setup({ settings: { trayJumpsToUnread: true } });

    jumping.setVisible(false);
    jumping.count("p1", 1);
    jumping.icon()?.click?.();
    await settle();

    expect(jumping.calls).toStrictEqual(["jump p1", "reveal p1"]);
  });

  it("brings a minimized window back rather than hiding it, from its click and its menu", () => {
    const app = setup({ platform: "linux", names: ["Home"] });

    app.minimize();

    expect(labels(app.icon()?.contextMenu)).toContain("Show Meru");

    app.icon()?.click?.();

    expect(app.calls).toStrictEqual(["reveal"]);
  });

  it("does nothing more once closed for the quit, whatever changes after", () => {
    const app = setup();

    app.count("p0", 2);
    app.tray.close();
    app.count("p0", 3);
    app.set("trayIconColor", "light");

    expect(app.events).toStrictEqual(["create", "destroy"]);
    expect(app.tray.isShown()).toBeFalsy();
  });

  it("quits from its last item", () => {
    const app = setup({ platform: "win32" });

    app.tray.update();
    app.icon()?.rightClick?.();
    clickLabel(app.icon()?.popped, "Exit");

    expect(app.calls).toStrictEqual(["quit"]);
  });
});
