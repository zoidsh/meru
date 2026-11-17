import { parseHTML } from "linkedom";
import { afterEach, describe, expect, it, vi } from "vitest";

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

/**
 * A page whose Refresh takes focus on mousedown, as Gmail's does, with
 * `held` focused before the press.
 */
const pageHolding = (held: "body" | "svg" | "none") => {
  vi.stubGlobal("MouseEvent", Event);
  vi.stubGlobal("PointerEvent", Event);

  const steps: string[] = [];
  const body = {};
  // An SVG element has `focus` but is no HTMLElement.
  const svg = { focus: () => steps.push("focus svg"), blur: () => null };
  let active: unknown = { body, svg, none: null }[held];
  const control = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 10, height: 10 }),
    dispatchEvent: (event: Event) => {
      steps.push(event.type);

      if (event.type === "mousedown") {
        active = control;
      }

      return true;
    },
    focus: () => steps.push("focus control"),
    blur: () => steps.push("blur control"),
  };

  return {
    steps,
    document: {
      body,
      get activeElement() {
        return active;
      },
      querySelector: () => control,
    } as unknown as Document,
  };
};

describe(pressRefresh, () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("presses nothing on a page without the control", () => {
    expect(
      pressRefresh(rootOf("<div></div>") as unknown as Document)
    ).toBeFalsy();
  });

  it.each([
    ["an SVG element", "svg", "focus svg"],
    ["the body", "body", "blur control"],
    ["nothing", "none", "blur control"],
  ] as const)(
    "gives focus back to %s that held it, else leaves none on the control",
    (_name, held, last) => {
      const { steps, document } = pageHolding(held);

      expect(pressRefresh(document)).toBeTruthy();
      expect(steps).toStrictEqual([
        "pointerdown",
        "mousedown",
        "pointerup",
        "mouseup",
        "click",
        "pointerout",
        "pointerleave",
        "mouseout",
        "mouseleave",
        last,
      ]);
    }
  );
});
