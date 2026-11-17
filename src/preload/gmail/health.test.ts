import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import {
  GMAIL_FEATURES,
  HIDES,
  findHook,
  guardedSelector,
} from "#core/gmail-hooks.ts";
import type { HookName } from "#core/gmail-hooks.ts";

import { checkHealth } from "./health.ts";

// Small, hand-written stand-ins for Gmail's markup, carrying only the anchors.
const LOGO =
  '<header><div><div><a href="#inbox"><img></a></div></div></header>';
const POLICY = '<a href="https://www.google.com/gmail/about/policy/">p</a>';
const FOOTER = `<div role="contentinfo">${POLICY}</div>`;
const PROMO = "<div data-rp-onramp-container><p>promo</p></div>";
const UPGRADE =
  '<header><div data-pep-id="global-pep-gmail" data-rp-onramp-container></div></header>';
const LIST = '<div gh="tl"><table></table></div>';

const page = (body: string, hash = "#inbox") => {
  const { document } = parseHTML(`<html><body>${body}</body></html>`);

  return {
    root: document as unknown as ParentNode,
    hash,
    isVisible: (element: Element) => element.closest("[hidden]") === null,
  };
};

const inbox = (main: string, header = LOGO) =>
  page(`${header}${UPGRADE}<div role="main">${main}</div>`);

describe(checkHealth, () => {
  it("matches every hook in an inbox that has them all", () => {
    expect(checkHealth(inbox(`${PROMO}${LIST}${FOOTER}`))).toStrictEqual({
      views: ["list"],
      hooks: {
        logo: "matched",
        footer: "matched",
        promo: "matched",
        upgrade: "matched",
      },
    });
  });

  it("tells a thread, compose and settings by their own anchors", () => {
    expect(
      checkHealth(
        page(
          `${LOGO}<div role="main"><h2 data-legacy-thread-id="1"></h2><div data-compose-id="2"></div></div>`,
          "#inbox/1"
        )
      ).views
    ).toStrictEqual(["thread", "compose"]);
    expect(checkHealth(page(LOGO, "#settings/general")).views).toStrictEqual([
      "settings",
    ]);
  });

  it("counts the list only while it shows", () => {
    expect(
      checkHealth(
        inbox(`<div hidden>${LIST}</div><h2 data-legacy-thread-id="1"></h2>`)
      ).views
    ).toStrictEqual(["thread"]);
  });

  it("calls the logo broken when the page has a view but no logo matches", () => {
    expect(
      checkHealth(
        inbox(LIST, '<header><a href="#inbox"><span></span></a></header>')
      ).hooks.logo
    ).toBe("broken");
  });

  it("calls the footer broken when its policy link shows outside every match, as with the reading pane", () => {
    const pane = `<div class="apa"><div class="apb"></div><div class="elsewhere">${POLICY}</div></div>`;

    expect(checkHealth(inbox(`${LIST}${FOOTER}${pane}`)).hooks.footer).toBe(
      "broken"
    );
  });

  it("matches the reading pane's footer through its own anchors", () => {
    const pane = `<div class="apa"><div class="apb"><div class="apc"><a href="https://drive.google.com/u/0/settings/storage"></a></div></div><div class="apO"><div class="bp">${POLICY}</div></div></div>`;

    expect(checkHealth(inbox(`${LIST}${pane}`)).hooks.footer).toBe("matched");
  });

  it("leaves the footer absent with no policy link, and a hidden one says nothing", () => {
    expect(checkHealth(inbox(LIST)).hooks.footer).toBe("absent");
    expect(
      checkHealth(inbox(`${LIST}<div hidden><div>${POLICY}</div></div>`)).hooks
        .footer
    ).toBe("absent");
  });

  it("never calls the promo broken, having no witness", () => {
    expect(checkHealth(inbox(LIST)).hooks.promo).toBe("absent");
  });

  it("calls the upgrade button broken when the header's onramp container shows without its id", () => {
    expect(
      checkHealth(
        page(
          `${LOGO}<header><div data-rp-onramp-container></div></header><div role="main">${LIST}</div>`
        )
      ).hooks.upgrade
    ).toBe("broken");
    expect(
      checkHealth(page(`${LOGO}<div role="main">${LIST}</div>`)).hooks.upgrade
    ).toBe("absent");
  });

  it("treats a selector the engine cannot parse as matching nothing", () => {
    expect(() => checkHealth(page("<p></p>", ""))).not.toThrow();
  });
});

/**
 * Markup Gmail might move a hook's anchor onto: a container that also holds
 * something no hide may ever take.
 */
const PRECIOUS = {
  list: LIST,
  thread: '<h2 data-legacy-thread-id="1"></h2>',
  message: '<div data-message-id="m"></div>',
  compose: '<div data-compose-id="c"></div>',
  main: '<div role="main"></div>',
  navigation: '<div role="navigation"></div>',
  search: "<form><input></form>",
  editor: '<div contenteditable="true"></div>',
};

/**
 * For each anchor of each hide's hooks, a container it takes, wrapped around
 * whatever else Gmail might have moved inside it.
 */
const SWALLOWING: Record<HookName, readonly ((inside: string) => string)[]> = {
  logo: [
    (inside) =>
      `<header><div><div><a href="#inbox"><img></a></div>${inside}</div></header>`,
  ],
  footer: [
    (inside) => `<div role="contentinfo">${POLICY}${inside}</div>`,
    (inside) =>
      `<div class="apa"><div class="apO">${POLICY}${inside}</div></div>`,
    (inside) =>
      `<div class="apa"><div class="apc"><a href="https://drive.google.com/u/0/settings/storage"></a>${inside}</div></div>`,
  ],
  promo: [
    (inside) =>
      `<div role="main"><div data-rp-onramp-container>${inside}</div></div>`,
    (inside) =>
      `<div data-elevated-container-view-type="timely_bump">${inside}</div>`,
  ],
  upgrade: [(inside) => `<div data-pep-id="global-pep-gmail">${inside}</div>`],
};

const guardCases = GMAIL_FEATURES.flatMap((feature) =>
  HIDES[feature].flatMap((name) =>
    SWALLOWING[name].flatMap((wrap, index) =>
      Object.entries(PRECIOUS).map(
        ([what, inside]) => [feature, name, index, what, wrap(inside)] as const
      )
    )
  )
);

describe("the guard on every hide", () => {
  it("has a swallowing container for every anchor", () => {
    for (const feature of GMAIL_FEATURES) {
      for (const name of HIDES[feature]) {
        expect(SWALLOWING[name]).toHaveLength(findHook(name).anchors.length);
      }
    }
  });

  it.each(guardCases)(
    "keeps %s from hiding a %s container (fixture %i) that holds the %s",
    (_feature, name, _index, _what, html) => {
      const { root } = page(html);
      const select = (selector: string) => [...root.querySelectorAll(selector)];
      const { anchors } = findHook(name);

      // The anchor alone would take it; guarded, as its rule and the health
      // check both select, nothing.
      expect(
        anchors.flatMap((anchor) => select(anchor)).length
      ).toBeGreaterThan(0);
      expect(
        anchors.flatMap((anchor) => select(guardedSelector(anchor)))
      ).toStrictEqual([]);
    }
  );
});
