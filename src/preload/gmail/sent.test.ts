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
    },
    (notice) => told.push(notice)
  );
  const bar = document.querySelector("#bar");

  return { document, bar, told, stop };
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
