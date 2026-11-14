import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { profiles } from "../../../shared/channels/profiles.ts";
import { settings } from "../../../shared/channels/settings.ts";
import { updater } from "../../../shared/channels/updater.ts";
import type { Settings } from "../../../shared/settings/registry.ts";
import type { Locked } from "../../../shared/settings/schema.ts";
import { answer, mountSettings, profileOf, tabOf } from "../../testing.tsx";
import { SettingsWindow } from "./settings-window.tsx";

const mounted: (() => void)[] = [];

const FREE_LOCKS: Locked = {
  "links.excludedApps": "free",
  "links.openInApp": "free",
};

const mount = ({
  page,
  layers = { global: {}, profiles: {} },
  locked = FREE_LOCKS,
  platform = "darwin",
}: {
  readonly page: string;
  readonly layers?: Settings;
  readonly locked?: Locked;
  readonly platform?: string;
}) => {
  location.hash = `/${page}`;
  const mountedPage = mountSettings(
    <SettingsWindow />,
    [
      answer(settings.snapshot, { layers, locked }),
      answer(settings.set, null),
      answer(updater.snapshot, { kind: "idle" }),
      answer(profiles.snapshot, {
        groups: [],
        profiles: [profileOf("personal", { label: "Personal" })],
        newProfileRefusal: null,
        selectedProfileId: "personal",
        tabs: [tabOf("mail", "gmail")],
      }),
    ],
    platform
  );
  mounted.push(mountedPage.unmount);
  return mountedPage;
};

const field = (key: string) =>
  document.querySelector<HTMLElement>(`[data-setting="${key}"]`);

const click = (element: Element | null | undefined) => {
  act(() => {
    if (element instanceof HTMLElement) {
      element.click();
    }
  });
};

const pickRows = () =>
  [
    ...(field("launcher.apps")?.querySelectorAll<HTMLElement>(
      "li[data-value]"
    ) ?? []),
  ].map((row) => ({
    checked: row.querySelector("input")?.checked,
    name: row.textContent,
  }));
const pick = (name: string) => {
  click(
    [...(field("launcher.apps")?.querySelectorAll("li[data-value]") ?? [])]
      .find((row) => row.textContent === name)
      ?.querySelector("input")
  );
};

describe(SettingsWindow, () => {
  afterEach(() => {
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    location.hash = "";
  });

  it("lists the pages in 3.x's order and shows the one the address names, moving to another on a click", () => {
    mount({ page: "updates" });
    const pages = [...document.querySelectorAll("nav button")].map(
      (button) => button.textContent
    );
    const before = document.querySelector("h1")?.textContent;
    click(
      [...document.querySelectorAll("nav button")].find(
        (button) => button.textContent === "Sidebar"
      )
    );
    act(() => {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect({
      after: document.querySelector("h1")?.textContent,
      before,
      hash: location.hash,
      pages,
    }).toStrictEqual({
      after: "Sidebar",
      before: "Updates",
      hash: "#/sidebar",
      pages: [
        "Profiles",
        "Appearance",
        "Panes",
        "Shortcuts",
        "Sidebar",
        "Updates",
      ],
    });
  });

  it("renders a string union as a select naming its value and a number within its schema's bounds, writing a pick through settings.set", async () => {
    const { sentOn } = mount({ page: "updates" });
    const hours = field("updater.intervalHours")?.querySelector("input");
    const trigger = field("updater.channel")?.querySelector("button");
    const shown = trigger?.querySelector(
      "[data-slot=select-value]"
    )?.textContent;
    click(trigger);
    await act(async () => {
      await Promise.resolve();
    });
    const options = [...document.querySelectorAll("[role=option]")];
    click(options.find((option) => option.textContent === "Beta"));
    expect({
      bounds: [hours?.min, hours?.max, hours?.step],
      options: options.map((option) => option.textContent),
      sent: sentOn(settings.set),
      shown,
    }).toStrictEqual({
      bounds: ["1", "168", "1"],
      options: ["Stable", "Beta"],
      sent: [{ key: "updater.channel", value: "beta" }],
      shown: "Stable",
    });
  });

  it("locks a Pro setting with the gate's reason while the entitlement refuses it, and lets it change once licensed", () => {
    mount({ page: "panes" });
    const locked = {
      reason:
        field("links.openInApp")?.querySelector("[data-locked]")?.textContent,
      toggle: field("links.openInApp")
        ?.querySelector("[role=switch]")
        ?.matches("[data-disabled]"),
    };
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    const { sentOn } = mount({ locked: {}, page: "panes" });
    click(field("links.openInApp")?.querySelector("[role=switch]"));
    expect({
      licensed: field("links.openInApp")?.querySelector("[data-locked]"),
      locked,
      sent: sentOn(settings.set),
    }).toStrictEqual({
      licensed: null,
      locked: { reason: "Upgrade to Meru Pro to unlock this.", toggle: true },
      sent: [{ key: "links.openInApp", value: false }],
    });
  });

  it("gives a setting a profile may override the selected profile's own value, taken from the value in force and given back to the global one", () => {
    const first = mount({ page: "panes" });
    const own = () =>
      field("stage.zoom")?.querySelectorAll("[role=switch]")[0] ?? null;
    click(own());
    const turnedOn = first.sentOn(settings.set);
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    const second = mount({
      layers: {
        global: { "stage.zoom": 1.5 },
        profiles: { personal: { "stage.zoom": 2 } },
      },
      page: "panes",
    });
    const values = [
      ...(field("stage.zoom")?.querySelectorAll<HTMLInputElement>(
        "input[type=number]"
      ) ?? []),
    ].map((input) => input.value);
    click(own());
    expect({
      turnedOff: second.sentOn(settings.set),
      turnedOn,
      values,
    }).toStrictEqual({
      turnedOff: [
        { key: "stage.zoom", profileId: "personal", value: undefined },
      ],
      turnedOn: [{ key: "stage.zoom", profileId: "personal", value: 1 }],
      values: ["1.5", "2"],
    });
  });

  it("shows a setting only on the platforms it does anything on, saying when it needs a restart", () => {
    mount({ page: "appearance" });
    const mac = field("window.linuxControls");
    for (const unmount of mounted.splice(0)) {
      unmount();
    }
    mount({ page: "appearance", platform: "linux" });
    expect({
      linux: field("window.linuxControls")?.textContent?.includes(
        "Restart Meru to apply the changes."
      ),
      mac,
    }).toStrictEqual({ linux: true, mac: null });
  });

  it("picks apps as checkboxes over the catalog, the picked ones first in their order, a newly checked one at the end", () => {
    const { sentOn } = mount({
      layers: {
        global: { "launcher.apps": ["drive", "calendar"] },
        profiles: {},
      },
      page: "sidebar",
    });
    const shown = pickRows().slice(0, 4);
    pick("Gmail");
    pick("Drive");
    expect({ sent: sentOn(settings.set), shown }).toStrictEqual({
      sent: [
        { key: "launcher.apps", value: ["drive", "calendar", "gmail"] },
        { key: "launcher.apps", value: ["calendar"] },
      ],
      shown: [
        { checked: true, name: "Drive" },
        { checked: true, name: "Calendar" },
        { checked: false, name: "Gmail" },
        { checked: false, name: "Admin" },
      ],
    });
  });
});
