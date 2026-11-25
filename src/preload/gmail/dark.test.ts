import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import { isDarkBackground } from "#core/gmail-dark.ts";
import {
  FEATURE_RULES,
  featureStylesheet,
  findHook,
  guardedSelector,
  insertedFeatures,
} from "#core/gmail-hooks.ts";
import type { GmailFeatures, HookName } from "#core/gmail-hooks.ts";

import { checkHealth } from "./health.ts";

/** Gmail's menu, quick settings among its kind, and a dialog. */
const POPUPS = `<div role="menu" class="J-M">
    <div class="J-N J-N-JT"><div class="J-N-Jz">Item<div class="J-N-JX"></div></div></div>
    <div class="asd">More</div><div class="J-Kh"></div>
    <div class="VO">Quick settings</div><div class="a21">Apps</div><div class="Q2">Default</div><div class="ST">Show</div>
    <div class="OG">Density</div><div class="Q5"><div>Inbox type</div></div>
    <button class="Tj">See all</button><button class="OD">Customise</button>
  </div>
  <div role="alertdialog"><h2 class="uW2Fw-bHp">New label</h2><label>Name</label><input><span class="mUIrbf-anl">Create</span></div>`;

/**
 * Gmail's surfaces cut to the classes and roles the dark theme takes: a
 * thread in its pane with an inline reply, a docked compose, a menu and a
 * dialog. `mail` is what a body and the drafts hold.
 */
const gmail = (mail: string, pane = "nH a98 iY", docked = "AD") => `
  <div role="main"><div class="${pane}">
    <h2 class="hP" data-legacy-thread-id="t1">Subject</h2>
    <div class="lnBNA">By Gemini <a class="R6DxZc">Learn more</a></div>
    <div role="list"><div role="listitem"><div data-message-id="m1">
      <span class="gD">Sender</span><span class="go">address</span><span class="g3">date</span><div class="iA g6"><span>snippet</span></div>
      <span class="hb"><span class="g2">to</span></span>
      <div class="gs"><div><div class="ii gt"><div class="a3s">${mail}</div></div>
        <div class="hq gt"><span class="aVW">One attachment</span><span class="mUIrbf-anl">Add to Drive</span></div>
      </div></div>
    </div></div></div>
    <span class="ams" role="link">Reply</span><svg class="aoH"></svg>
    <div class="btDi4d"><div class="nr wR"></div><div class="aC2"></div>
      <div data-compose-id="r1"><table><tr><td class="I5"><table><tr><td class="Ap"><div g_editable="true" contenteditable="true">${mail}</div></td></tr></table></td></tr></table><div class="aDj ahe"><div class="aC3"></div></div></div>
    </div>
  </div></div>
  <div class="${docked}"><div role="dialog">
    <div class="l m"><h2 class="a3E"><div class="a3I">New Message</div><span>×</span></h2></div>
    <div class="aaZ"><div data-compose-id="c1">
      <div class="aGb"><label class="gO">To</label><span class="aB">Cc</span><input class="agP"><input class="aoT"></div>
      <div class="az2"><div class="J-JN-M-I-Jm"><span>From</span></div></div>
      <div class="qz"><table><tr><td class="Ap"><div g_editable="true" contenteditable="true">${mail}</div></td></tr></table></div>
      <div class="aDj"><table><tr class="btC"><td><div class="aaA"></div><div class="og"></div><div class="J-JN-M-I-JG"></div></td></tr></table></div>
      <div class="aoD"></div><svg class="aoH"></svg>
    </div></div>
  </div></div>
  ${POPUPS}`;

/** A sender's mail written in Gmail's own classes and roles, as anyone can. */
const MIMIC = gmail("").replaceAll(
  /data-[a-z-]+="[^"]*"|g_editable="true"|contenteditable="true"/gu,
  ""
);

const page = (html: string, hash = "#inbox/t1") => {
  const { document } = parseHTML(`<html><body>${html}</body></html>`);

  return {
    root: document as unknown as ParentNode,
    document,
    hash,
    isVisible: () => true,
  };
};

const select = (root: ParentNode, selector: string) => [
  ...root.querySelectorAll(selector),
];

const DARK_RULES = FEATURE_RULES.extendDarkTheme;

const DARK_HOOKS = [...new Set(DARK_RULES.map(({ hook }) => hook))];

/** What each rule of the dark theme's stylesheet styles, a pseudo-element by its own element. */
const RULES = featureStylesheet("extendDarkTheme")
  .split("\n")
  .map((rule) =>
    rule.slice(0, rule.lastIndexOf(" { ")).replace(/::after$/u, "")
  );

const CARDS = DARK_RULES.flatMap(({ hook, only }) =>
  findHook(hook).scope === "card"
    ? (only ?? findHook(hook).anchors).map((anchor) =>
        guardedSelector(findHook(hook), anchor)
      )
    : []
);

/** The declarations of each dark rule whose hook is of `scope`. */
const scoped = (scope: string) =>
  DARK_RULES.filter(({ hook }) => findHook(hook).scope === scope).map(
    ({ declarations }) => declarations
  );

/**
 * What ink may set with no test of what it holds: the colour a card sets
 * back, and a border, which reaches nothing it holds.
 */
const INK = new Set(["color", "border-color"]);

/** What a popup may set: its own surface and the colour its text inherits. */
const POPUP = new Set(["background-color", "color"]);

/** An anchor whose subject is an image or an icon, which holds no mail. */
const holdsNothing = (anchor: string) =>
  /^(?:img|svg)(?![\w-])/u.test(anchor.split(/[\s>+~]+/u).at(-1) ?? "");

const properties = (declarations: string) =>
  declarations
    .split(";")
    .map((declaration) => declaration.split(":")[0]?.trim() ?? "")
    .filter(Boolean);

/** The nearest of an element's ancestors a dark rule styles. */
const nearestStyled = (element: Element) => {
  let nearest = element.parentElement;

  while (nearest && !RULES.some((selector) => nearest?.matches(selector))) {
    nearest = nearest.parentElement;
  }

  return nearest;
};

/** What a body or a draft's editor holds, which no rule may style. */
const isMail = (element: Element) =>
  element.closest(".a3s, [contenteditable]") !== null;

describe(isDarkBackground, () => {
  it("is Gmail's Dark page, and not its Default one", () => {
    expect(isDarkBackground("rgb(17, 17, 17)")).toBeTruthy();
    expect(isDarkBackground("rgb(248, 250, 253)")).toBeFalsy();
  });

  it("is never a page with no opaque colour, as a photo theme's", () => {
    expect(isDarkBackground("rgba(0, 0, 0, 0)")).toBeFalsy();
    expect(isDarkBackground("rgba(17, 17, 17, 0.5)")).toBeFalsy();
    expect(isDarkBackground("rgba(17, 17, 17, 1)")).toBeTruthy();
  });

  it("is never what it cannot read", () => {
    expect(isDarkBackground("")).toBeFalsy();
    expect(isDarkBackground("transparent")).toBeFalsy();
    expect(isDarkBackground("color(srgb 0 0 0)")).toBeFalsy();
  });

  it("draws the line between dark and mid grey", () => {
    expect(isDarkBackground("rgb(60, 60, 60)")).toBeTruthy();
    expect(isDarkBackground("rgb(128, 128, 128)")).toBeFalsy();
  });
});

const switches = (extendDarkTheme: boolean): GmailFeatures => ({
  hideInboxFooter: false,
  hidePromoBanner: true,
  hideUpgradeButton: false,
  reverseConversation: true,
  moveAttachmentsToTop: false,
  showTrimmedContent: true,
  extendDarkTheme,
});

describe(insertedFeatures, () => {
  it("inserts the dark theme only while it is on and Gmail is Dark", () => {
    const whole = { dark: true, cardsBroken: false };

    expect(insertedFeatures(switches(true), whole)).toStrictEqual(
      switches(true)
    );
    expect(
      insertedFeatures(switches(true), { ...whole, dark: false })
    ).toStrictEqual(switches(false));
    expect(insertedFeatures(switches(false), whole)).toStrictEqual(
      switches(false)
    );
  });

  it("inserts no dark theme while a body or the editor is outside its card", () => {
    expect(
      insertedFeatures(switches(true), { dark: true, cardsBroken: true })
    ).toStrictEqual(switches(false));
  });
});

describe("the dark theme's rules", () => {
  it("take every part they name where Gmail draws it", () => {
    const { root } = page(gmail(""));

    for (const name of DARK_HOOKS) {
      const hook = findHook(name);

      expect(
        hook.anchors.filter(
          (anchor) => select(root, guardedSelector(hook, anchor)).length === 0
        )
      ).toStrictEqual([]);
    }
  });

  it("style nothing in a body or a draft, even mail written in Gmail's own classes", () => {
    const { root } = page(gmail(MIMIC));

    expect(select(root, ".a3s .iY")).not.toHaveLength(0);

    expect(
      RULES.filter((selector) => select(root, selector).some(isMail))
    ).toStrictEqual([]);
  });

  it("give every body and draft a card of Gmail's own colours as the nearest part they style", () => {
    const { root } = page(gmail(MIMIC));
    const held = [
      ...select(root, ".a3s"),
      ...select(root, "[contenteditable]"),
    ].filter((element) => !isMail(element.parentElement as Element));

    expect(held).toHaveLength(3);

    expect(
      held.filter(
        (element) =>
          !CARDS.some((card) => nearestStyled(element)?.matches(card))
      )
    ).toStrictEqual([]);
  });

  it("set only what a card sets back where they never test what they hold, unless on an image or an icon", () => {
    const ink = DARK_RULES.filter(({ hook }) => findHook(hook).scope === "ink");

    expect(ink).not.toHaveLength(0);
    expect(
      ink.filter(
        ({ hook, only, declarations }) =>
          !properties(declarations).every((property) => INK.has(property)) &&
          !(only ?? findHook(hook).anchors).every(holdsNothing)
      )
    ).toStrictEqual([]);
  });

  it("tell an image or an icon by the subject of its anchor alone", () => {
    expect(
      [
        ".iY svg.aoH",
        "svg .aoH",
        "img",
        ".a > img:hover",
        "svg-like",
        ".x svg span",
      ].map(holdsNothing)
    ).toStrictEqual([true, false, true, true, false, false]);
  });

  it("set only a popup's surface and colour on a menu, a dialog and their text", () => {
    expect(scoped("popup")).not.toHaveLength(0);
    expect(
      scoped("popup")
        .flatMap(properties)
        .filter((property) => !POPUP.has(property))
    ).toStrictEqual([]);
  });

  it("give a card Gmail's own white and text colour, and a surface, which may hold mail, colours alone", () => {
    expect(scoped("card")).not.toHaveLength(0);
    expect(
      scoped("card").filter(
        (declarations) =>
          !declarations.includes("background-color: rgb(255, 255, 255)") ||
          !declarations.includes(" color: rgb(34, 34, 34)")
      )
    ).toStrictEqual([]);
    expect(
      scoped("surface")
        .flatMap(properties)
        .filter((property) => !["background-color", "color"].includes(property))
    ).toStrictEqual([]);
  });
});

/** Where a menu or dialog is a sender's or a writer's, not Gmail's. */
const POPUP_REFUSED: Record<string, (popup: string) => string> = {
  "in a message, outside its body": (popup) =>
    `<div data-message-id="m"><div class="gs">${popup}</div></div>`,
  "in a body": (popup) =>
    `<div data-message-id="m"><div class="a3s">${popup}</div></div>`,
  "in a draft": (popup) =>
    `<div data-compose-id="c"><div contenteditable="true">${popup}</div></div>`,
};

const popups: [HookName, string][] = [
  ["darkMenu", "menu"],
  ["darkDialog", "alertdialog"],
];

describe("the dark theme's menus and dialogs", () => {
  it.each(popups)("%s takes Gmail's own %s", (name, role) => {
    const { root } = page(`<div role="${role}"></div>`);

    expect(
      select(root, guardedSelector(findHook(name), `[role="${role}"]`))
    ).toHaveLength(1);
  });

  it.each(
    popups.flatMap(([name, role]) =>
      Object.entries(POPUP_REFUSED).map(
        ([where, wrap]) =>
          [name, where, wrap(`<div role="${role}"></div>`), role] as const
      )
    )
  )("%s refuses one %s", (name, _where, html, role) => {
    const { root } = page(html);

    expect(select(root, `[role="${role}"]`)).toHaveLength(1);
    expect(
      select(root, guardedSelector(findHook(name), `[role="${role}"]`))
    ).toStrictEqual([]);
  });
});

describe("the dark theme's menus and dialogs, written in a message", () => {
  it.each(Object.entries(POPUP_REFUSED))(
    "take nothing of one %s, their text included",
    (_where, wrap) => {
      const { root } = page(wrap(POPUPS));

      expect(select(root, ".J-N-Jz")).toHaveLength(1);
      expect(
        RULES.filter((selector) => select(root, selector).length > 0)
      ).toStrictEqual([]);
    }
  );
});

const hooksOf = (html: string) => checkHealth(page(html)).hooks;

describe("the dark theme's health", () => {
  it("matches every surface Gmail draws", () => {
    const hooks = hooksOf(gmail(""));

    expect(
      DARK_HOOKS.filter((name) => hooks[name] !== "matched")
    ).toStrictEqual([]);
  });

  it("calls the pane broken when Gmail renames it in a thread", () => {
    expect(hooksOf(gmail("", "nH a98 renamed")).darkPane).toBe("broken");
  });

  it("calls the docked compose broken when Gmail renames its window", () => {
    expect(hooksOf(gmail("", undefined, "renamed")).darkCompose).toBe("broken");
  });

  it("calls a body's card broken when the body shows outside every card", () => {
    expect(
      hooksOf(gmail("").replace('class="ii gt"', 'class="renamed"')).bodyCard
    ).toBe("broken");
  });

  it("calls the editor's card broken when a draft shows outside every card", () => {
    expect(
      hooksOf(gmail("").replaceAll('class="Ap"', 'class="renamed"')).editorCard
    ).toBe("broken");
  });

  it("leaves a menu or dialog absent when none is open", () => {
    const hooks = hooksOf('<h2 data-legacy-thread-id="t1"></h2>');

    expect([hooks.darkMenu, hooks.darkDialog]).toStrictEqual([
      "absent",
      "absent",
    ]);
  });
});
