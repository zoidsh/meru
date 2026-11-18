import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import type { Overlay } from "#core/overlay.ts";
import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { Size } from "#core/window-bounds.ts";

import { createOpenApp } from "./open-app.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "b",
};

const setup = (initial?: Overlay, state: State = two, pageSize?: Size) => {
  let open = initial;
  const events: unknown[] = [];
  const openApp = createOpenApp({
    apps: APPS,
    state: () => state,
    overlays: {
      open: (next) => {
        open = next;
        events.push(["open", next]);
      },
      close: () => {
        open = undefined;
        events.push(["close"]);
      },
      current: () => open,
    },
    openTab: (profileId, app, url, _after, split) => {
      events.push(["tab", profileId, app.id, url, ...(split ? [split] : [])]);

      return Promise.resolve();
    },
    splitTab: (key, direction) => {
      events.push(["split", key, direction]);

      return Promise.resolve();
    },
    pageSize: () => pageSize ?? { width: 1000, height: 700 },
    log: () => false,
  });

  return { openApp, events };
};

describe(createOpenApp, () => {
  it("opens over the selected profile, and closes only itself", () => {
    const { openApp, events } = setup({ kind: "inbox" });

    openApp.setOpen(false);
    openApp.setOpen(true);

    const opened = openApp.isOpen();

    openApp.setOpen(false);

    expect([opened, openApp.isOpen(), events]).toStrictEqual([
      true,
      false,
      [["open", { kind: "open-app", profileId: "b" }], ["close"]],
    ]);
  });

  it("closes, then opens the chosen app's home as a tab of its profile", async () => {
    const { openApp, events } = setup({ kind: "open-app", profileId: "a" });
    const calendar = APPS.find(({ id }) => id === "calendar");

    await openApp.choose("calendar");

    expect(events).toStrictEqual([
      ["close"],
      ["tab", "a", "calendar", calendar?.home],
    ]);
  });

  it("refuses an app it does not list, and any while it is not open", async () => {
    const listed = setup({ kind: "open-app", profileId: "a" });
    const closed = setup({ kind: "inbox" });

    await listed.openApp.choose("gmail");
    await listed.openApp.choose("nowhere");
    await closed.openApp.choose("calendar");

    expect([listed.events, closed.events]).toStrictEqual([[], []]);
  });

  it("opens as Open in split beside the selected tab, and puts the pick in a new pane, Gmail's own tab as it is", async () => {
    const calendarTab = { id: "c1", app: "calendar", url: "", title: "" };
    const onCalendar: State = {
      ...two,
      profiles: [
        newProfile("a", "Default"),
        {
          ...newProfile("b", "Work"),
          tabs: [gmailTab(), calendarTab],
          selectedTabId: "c1",
        },
      ],
    };
    const { openApp, events } = setup(undefined, onCalendar);
    const drive = APPS.find(({ id }) => id === "drive");

    openApp.openSplit("row");
    await openApp.choose("drive");
    openApp.openSplit("column");
    await openApp.choose("gmail");

    expect(events).toStrictEqual([
      ["open", { kind: "open-app", profileId: "b", split: "row" }],
      ["close"],
      ["tab", "b", "drive", drive?.home, "row"],
      ["open", { kind: "open-app", profileId: "b", split: "column" }],
      ["close"],
      ["split", { profileId: "b", tabId: "gmail" }, "column"],
    ]);
  });

  it("says there is no room instead of opening, or of splitting where the page shrank meanwhile", async () => {
    const narrow = setup(undefined, two, { width: 480, height: 700 });

    narrow.openApp.openSplit("row");
    narrow.openApp.openSplit("column");

    const shrunk = setup(
      { kind: "open-app", profileId: "b", split: "row" },
      two,
      { width: 400, height: 400 }
    );

    await shrunk.openApp.choose("drive");

    expect([narrow.events, shrunk.events]).toStrictEqual([
      [
        ["open", { kind: "toast", message: "no-room" }],
        ["open", { kind: "open-app", profileId: "b", split: "column" }],
      ],
      [["close"], ["open", { kind: "toast", message: "no-room" }]],
    ]);
  });
});
