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

  it("takes no witness from mail: a message linking to Gmail's policy page leaves the footer matched", () => {
    expect(
      checkHealth(
        inbox(`${LIST}${FOOTER}<div data-message-id="m"><p>${POLICY}</p></div>`)
      ).hooks.footer
    ).toBe("matched");
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
  ],
  upgrade: [(inside) => `<div data-pep-id="global-pep-gmail">${inside}</div>`],
};

const marking = (attribute: string, value: string) => (element: Element) => {
  element.setAttribute(attribute, value);
};

/** Each protected kind, as an anchor's own match could be made into it. */
const BECOMING: Record<string, (element: Element) => void> = {
  list: marking("gh", "tl"),
  thread: marking("data-legacy-thread-id", "1"),
  message: marking("data-message-id", "m"),
  compose: marking("data-compose-id", "c"),
  main: marking("role", "main"),
  navigation: marking("role", "navigation"),
  editor: marking("contenteditable", "true"),
  ...Object.fromEntries(
    ["input", "textarea"].map((tag) => [
      tag,
      (element: Element) => {
        const replacement = element.ownerDocument.createElement(tag);

        for (const { name, value } of element.attributes) {
          replacement.setAttribute(name, value);
        }

        element.replaceWith(replacement);
      },
    ])
  ),
};

/** Mail and writing, where nothing matched is Gmail's own part. */
const AUTHORED: Record<string, (html: string) => string> = {
  message: (html) => `<div data-message-id="m"><p>${html}</p></div>`,
  compose: (html) => `<div data-compose-id="c">${html}</div>`,
  editor: (html) => `<div contenteditable="true">${html}</div>`,
};

const select = (root: ParentNode, selector: string) => [
  ...root.querySelectorAll(selector),
];

const anchorCases = GMAIL_FEATURES.flatMap((feature) =>
  HIDES[feature].flatMap((name) =>
    SWALLOWING[name].map(
      (wrap, index) =>
        [
          feature,
          name,
          index,
          findHook(name).anchors[index] ?? "",
          wrap,
        ] as const
    )
  )
);

const guardCases = anchorCases.flatMap(([feature, name, index, , wrap]) =>
  Object.entries(PRECIOUS).map(
    ([what, inside]) => [feature, name, index, what, wrap(inside)] as const
  )
);

/**
 * The anchor's own match made into each protected kind, kept only where the
 * anchor would still take it: a footer's contentinfo cannot also be the main.
 */
const selfCases = anchorCases.flatMap(([feature, name, index, anchor, wrap]) =>
  Object.entries(BECOMING).flatMap(([what, become]) => {
    const { document } = parseHTML(`<html><body>${wrap("")}</body></html>`);
    const [match] = select(document, anchor);

    if (!match) {
      return [];
    }

    become(match);

    return select(document, anchor).length > 0
      ? [[feature, name, index, what, document.body.innerHTML] as const]
      : [];
  })
);

const authoredCases = anchorCases.flatMap(([feature, name, index, , wrap]) =>
  Object.entries(AUTHORED).map(
    ([what, around]) => [feature, name, index, what, around(wrap(""))] as const
  )
);

/**
 * What the anchor alone takes, and what it takes guarded, as its rule and the
 * health check both select.
 */
const takes = (name: HookName, html: string) => {
  const { root } = page(html);
  const { anchors } = findHook(name);

  return {
    unguarded: anchors.some((anchor) => select(root, anchor).length > 0),
    guarded: anchors.flatMap((anchor) => select(root, guardedSelector(anchor))),
  };
};

const GUARDED = { unguarded: true, guarded: [] };

describe("the guard on every hide", () => {
  it("has a swallowing container for every anchor", () => {
    for (const feature of GMAIL_FEATURES) {
      for (const name of HIDES[feature]) {
        expect(SWALLOWING[name]).toHaveLength(findHook(name).anchors.length);
      }
    }
  });

  it("makes every protected kind some anchor's own match", () => {
    expect(new Set(selfCases.map((selfCase) => selfCase[3]))).toStrictEqual(
      new Set(Object.keys(BECOMING))
    );
  });

  it.each(guardCases)(
    "keeps %s from hiding a %s container (fixture %i) that holds the %s",
    (_feature, name, _index, _what, html) => {
      expect(takes(name, html)).toStrictEqual(GUARDED);
    }
  );

  it.each(selfCases)(
    "keeps %s from hiding a %s match (fixture %i) that is itself the %s",
    (_feature, name, _index, _what, html) => {
      expect(takes(name, html)).toStrictEqual(GUARDED);
    }
  );

  it.each(authoredCases)(
    "keeps %s from hiding a %s match (fixture %i) inside a %s",
    (_feature, name, _index, _what, html) => {
      expect(takes(name, html)).toStrictEqual(GUARDED);
    }
  );
});
