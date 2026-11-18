import { describe, expect, it } from "vitest";

import { APPS } from "#core/apps.ts";
import type { Overlay } from "#core/overlay.ts";
import { newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";

import { createOpenApp } from "./open-app.ts";

const two: State = {
  version: 1,
  profiles: [newProfile("a", "Default"), newProfile("b", "Work")],
  selectedProfileId: "b",
};

const setup = (initial?: Overlay) => {
  let open = initial;
  const events: unknown[] = [];
  const openApp = createOpenApp({
    apps: APPS,
    state: () => two,
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
    openTab: (profileId, app, url) => {
      events.push(["tab", profileId, app.id, url]);

      return Promise.resolve();
    },
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
});
