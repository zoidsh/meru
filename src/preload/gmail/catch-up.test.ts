import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { findRefresh, pressRefresh } from "./catch-up.ts";

const REFRESH = '<div act="20" id="refresh" role="button"></div>';

const rootOf = (body: string) =>
  parseHTML(`<html><body>${body}</body></html>`).document;

describe(findRefresh, () => {
  it("finds Gmail's Refresh in its toolbar, hidden too", () => {
    expect(
      findRefresh(
        rootOf(`<div role="main"><div gh="mtb">${REFRESH}</div></div>`)
      )?.id
    ).toBe("refresh");
    expect(findRefresh(rootOf(`<div hidden>${REFRESH}</div>`))?.id).toBe(
      "refresh"
    );
  });

  it.each([
    ["in a message", `<div data-message-id="m">${REFRESH}</div>`],
    ["in a draft", `<div data-compose-id="c">${REFRESH}</div>`],
    ["in an editor", `<div contenteditable="true">${REFRESH}</div>`],
    [
      "holding the list",
      '<div act="20" id="refresh"><div gh="tl"></div></div>',
    ],
    ["as a field", '<input act="20" id="refresh">'],
    ["by another action code", '<div act="2" id="refresh"></div>'],
  ])("takes nothing %s", (_where, body) => {
    expect(findRefresh(rootOf(body))).toBeUndefined();
  });
});

describe(pressRefresh, () => {
  it("presses nothing on a page without the control", () => {
    expect(
      pressRefresh(rootOf("<div></div>") as unknown as Document)
    ).toBeFalsy();
  });
});
