import { delay } from "es-toolkit";
import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SentNotice } from "#contract/gmail-channels.ts";

import { sentNoticeShown, undoSent, watchSentNotice } from "./sent.ts";

// Gmail's bar as it reads after a send: the notice, then Undo and View message.
const NOTICE = `<div class="vh"><span class="aT"><span class="bAq">Message sent</span><span class="bAo">&nbsp;&nbsp;</span><span id="link_undo" class="ag a8k" role="link">Undo</span><span id="link_vsm" class="ag a8k" role="link">View message</span></span></div>`;

const pageOf = (body: string) => parseHTML(`<html><body>${body}</body></html>`);

const rootOf = (body: string) => pageOf(body).document;

const shown = (element: Element) => !element.closest("[hidden]");

describe(sentNoticeShown, () => {
  it("finds Gmail's Message sent bar by its Undo and View message links", () => {
    expect(
      sentNoticeShown(rootOf(`<div class="b8 UC">${NOTICE}</div>`), shown)
    ).toBeTruthy();
  });

  it.each([
    ["no bar at all", '<div class="vh"></div>'],
    [
      "a bar of another notice, with Undo alone",
      '<div class="vh"><span id="link_undo">Undo</span></div>',
    ],
    ["a hidden bar", `<div hidden>${NOTICE}</div>`],
    ["the bar quoted in a message", `<div data-message-id="m">${NOTICE}</div>`],
    [
      "the bar pasted into a draft",
      `<div contenteditable="true">${NOTICE}</div>`,
    ],
  ])("finds nothing with %s", (_what, body) => {
    expect(sentNoticeShown(rootOf(body), shown)).toBeFalsy();
  });
});

/** A page whose checks run as soon as its mutations are delivered. */
const watch = (body: string) => {
  const { document, window } = pageOf(body);
  const told: SentNotice[] = [];

  vi.stubGlobal("MutationObserver", window.MutationObserver);

  const stop = watchSentNotice(
    {
      root: document,
      isVisible: shown,
      beforePaint: (check) => {
        check();
      },
      afterGone: (look) => {
        look();
      },
    },
    (notice) => told.push(notice)
  );
  const bar = document.querySelector("#bar");

  return { document, window, bar, told, stop };
};

/** Lets the observer deliver what changed. */
const settle = () => delay(0);

describe(watchSentNotice, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tells once as the notice appears and once as it goes", async () => {
    const { document, bar, told } = watch('<div class="b8 UC" id="bar"></div>');

    expect(told).toStrictEqual([]);

    bar?.insertAdjacentHTML("beforeend", NOTICE);
    await settle();
    bar?.append(document.createElement("span"));
    await settle();

    expect(told).toStrictEqual(["shown"]);

    bar?.replaceChildren();
    await settle();

    expect(told).toStrictEqual(["shown", "gone"]);
  });

  it("tells the notice undone when it goes with a compose in the page, as Gmail's Undo brings the draft back", async () => {
    const { document, bar, told } = watch(
      `<div class="b8 UC" id="bar">${NOTICE}</div>`
    );

    bar?.replaceChildren();
    document.body.insertAdjacentHTML(
      "beforeend",
      '<div data-compose-id="1"></div>'
    );
    await settle();

    expect(told).toStrictEqual(["shown", "undone"]);
  });

  it("tells no going of a notice that came back before the page settled", async () => {
    const { document, window } = pageOf('<div id="bar"></div>');
    const told: SentNotice[] = [];
    const later: (() => void)[] = [];

    vi.stubGlobal("MutationObserver", window.MutationObserver);
    watchSentNotice(
      {
        root: document,
        isVisible: shown,
        beforePaint: (check) => {
          check();
        },
        afterGone: (look) => {
          later.push(look);
        },
      },
      (notice) => told.push(notice)
    );

    const bar = document.querySelector("#bar");

    bar?.insertAdjacentHTML("beforeend", NOTICE);
    await settle();
    bar?.replaceChildren();
    await settle();
    bar?.insertAdjacentHTML("beforeend", NOTICE);
    await settle();

    for (const look of later) {
      look();
    }

    expect(told).toStrictEqual(["shown", "shown"]);
  });

  it("tells the notice undone at once as its own Undo is pressed, before the bar goes, and tells nothing more as it goes", async () => {
    const { document, window, bar, told } = watch(
      `<div class="b8 UC" id="bar">${NOTICE}</div>`
    );

    document
      .querySelector("#link_undo")
      ?.dispatchEvent(new window.Event("click", { bubbles: true }));

    expect(told).toStrictEqual(["shown", "undone"]);

    bar?.replaceChildren();
    await settle();

    expect(told).toStrictEqual(["shown", "undone"]);
  });

  it("hears no press of Undo quoted in a message, nor of the bar's other links", () => {
    const { document, window, told } = watch(
      `<div class="b8 UC">${NOTICE}</div><div data-message-id="m">${NOTICE.replace('id="link_undo"', 'id="link_undo" class="quoted"')}</div>`
    );
    const Click = window.Event;

    document
      .querySelector(".quoted")
      ?.dispatchEvent(new Click("click", { bubbles: true }));
    document
      .querySelector("#link_vsm")
      ?.dispatchEvent(new Click("click", { bubbles: true }));

    expect(told).toStrictEqual(["shown"]);
  });

  it("tells of a notice already there as it starts", () => {
    const { told } = watch(NOTICE);

    expect(told).toStrictEqual(["shown"]);
  });

  it("tells nothing once stopped", async () => {
    const { bar, told, stop } = watch('<div id="bar"></div>');

    stop();
    bar?.insertAdjacentHTML("beforeend", NOTICE);
    await settle();

    expect(told).toStrictEqual([]);
  });
});

describe(undoSent, () => {
  it("presses the bar's own Undo", () => {
    const document = rootOf(`<div class="b8 UC">${NOTICE}</div>`);
    const pressed: string[] = [];

    document
      .querySelector("#link_undo")
      ?.addEventListener("click", () => pressed.push("undo"));

    expect(undoSent(document)).toBeTruthy();
    expect(pressed).toStrictEqual(["undo"]);
  });

  it.each([
    ["no bar", '<div class="vh"></div>'],
    ["the bar quoted in a message", `<div data-message-id="m">${NOTICE}</div>`],
  ])("presses nothing with %s", (_what, body) => {
    expect(undoSent(rootOf(body))).toBeFalsy();
  });
});
