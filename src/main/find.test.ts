import { describe, expect, it } from "vitest";

import { gmailTab, newProfile } from "#core/state.ts";
import type { State } from "#core/state.ts";
import type { TabKey } from "#core/tabs.ts";

import { createFind } from "./find.ts";
import { createFocus } from "./focus.ts";
import { createOverlays } from "./overlay.ts";

const mail = { profileId: "a", tabId: "gmail" };
const week = { profileId: "a", tabId: "c1" };

const initial: State = {
  version: 1,
  profiles: [
    {
      ...newProfile("a", "Default"),
      tabs: [gmailTab(), { id: "c1", app: "calendar", url: "", title: "Week" }],
    },
  ],
  selectedProfileId: "a",
};

/**
 * The find bar over the real overlays and focus, in a fake overlay view,
 * and pages that record each search and stop and answer with ids in turn.
 */
const setup = () => {
  const asked: string[] = [];
  const focused: string[] = [];
  let front: TabKey | undefined = mail;
  let requestId = 0;

  const focus = createFocus({
    window: { isFocused: () => true, isVisible: () => true, on: () => false },
    focusWhileInactive: false,
    resolve: (target) =>
      target.kind === "overlay"
        ? // oxlint-disable-next-line no-use-before-define -- resolved when focus moves
          overlays.focuser()
        : () => {
            focused.push(target.kind);
            focus.noteFocused(target);
          },
  });
  const overlays = createOverlays({
    focus,
    initial,
    bounds: () => ({ x: 0, y: 0, width: 400, height: 56 }),
    log: () => false,
  });

  overlays.adopt({
    webContentsId: 3,
    setBounds: () => false,
    show: () => false,
    hide: () => false,
    focus: () => {
      focused.push("overlay");
      focus.noteFocused({ kind: "overlay" });
    },
    onFocus: () => false,
    onKey: () => false,
    onGone: () => false,
    close: () => false,
  });

  const find = createFind({
    pages: {
      findable: () => front,
      findInPage: (key, term, { findNext, forward }) => {
        asked.push(
          `${key.tabId} ${term} ${findNext ? "new" : "step"} ${forward ? "on" : "back"}`
        );
        requestId += 1;

        return requestId;
      },
      stopFindInPage: (key, keepSelection) => {
        asked.push(`${key.tabId} stop${keepSelection ? " kept" : ""}`);
      },
    },
    overlays,
    focus,
  });

  overlays.onChange(find.follow);

  return {
    find,
    overlays,
    asked,
    focused,
    setFront: (next: TabKey | undefined) => {
      front = next;
      find.follow();
    },
    lastId: () => requestId,
  };
};

describe(createFind, () => {
  it("opens the bar over the front tab's page in the overlay, focused, and shows what the page finds", () => {
    const { find, overlays, asked, focused, lastId } = setup();

    find.open();
    find.type("apple");
    find.found(mail, { requestId: lastId(), ordinal: 1, matches: 3 });

    expect([overlays.current(), find.current(), asked, focused]).toStrictEqual([
      { kind: "find", ...mail },
      {
        key: mail,
        term: "apple",
        ordinal: 1,
        matches: 3,
        requestId: 1,
        opened: 1,
      },
      ["gmail apple new on"],
      ["overlay"],
    ]);
  });

  it("steps either way and keeps only the latest answer", () => {
    const { find, asked, lastId } = setup();

    find.open();
    find.type("apple");
    find.found(mail, { requestId: lastId(), ordinal: 1, matches: 3 });
    find.step(false);
    find.found(mail, { requestId: lastId(), ordinal: 3, matches: 3 });
    find.found(mail, { requestId: 1, ordinal: 1, matches: 3 });

    expect([asked, find.current()?.ordinal]).toStrictEqual([
      ["gmail apple new on", "gmail apple step back"],
      3,
    ]);
  });

  it("closes from the overlay, ending the search with the match selected and focus on the page, and remembers the term", () => {
    const { find, overlays, asked, focused } = setup();

    find.open();
    find.type("apple");
    overlays.close();

    expect([find.current(), find.canGoOn(), asked, focused]).toStrictEqual([
      undefined,
      true,
      ["gmail apple new on", "gmail stop kept"],
      ["overlay", "front"],
    ]);
  });

  it("goes on from closed with the remembered term, opening the bar", () => {
    const { find, overlays, asked } = setup();
    const unremembered = find.canGoOn();

    find.open();
    find.type("apple");
    overlays.close();
    find.again(true);

    expect([
      unremembered,
      overlays.current()?.kind,
      asked.at(-1),
    ]).toStrictEqual([false, "find", "gmail apple new on"]);
  });

  it("gives the field focus back when opened again while open, searching nothing", () => {
    const { find, asked, focused } = setup();

    find.open();
    find.type("apple");
    find.open();

    expect([find.current()?.opened, asked, focused]).toStrictEqual([
      2,
      ["gmail apple new on"],
      ["overlay", "overlay"],
    ]);
  });

  it("closes when another tab or pane comes to the front, or the page goes", () => {
    const { find, overlays, asked, setFront } = setup();

    find.open();
    find.type("apple");
    setFront(week);

    const afterSwitch = [overlays.current(), find.current()];

    setFront(undefined);
    find.open();

    expect([afterSwitch, overlays.current(), asked]).toStrictEqual([
      [undefined, undefined],
      undefined,
      ["gmail apple new on", "gmail stop kept"],
    ]);
  });

  it("searches again when its page loads", () => {
    const { find, asked } = setup();

    find.open();
    find.type("apple");
    find.loaded(week);
    find.loaded(mail);

    expect(asked).toStrictEqual(["gmail apple new on", "gmail apple new on"]);
  });

  it("closes when another overlay replaces it", () => {
    const { find, overlays, asked } = setup();

    find.open();
    find.type("apple");
    overlays.open({ kind: "toast", message: "no-room" });

    expect([find.current(), asked.at(-1)]).toStrictEqual([
      undefined,
      "gmail stop kept",
    ]);
  });
});
