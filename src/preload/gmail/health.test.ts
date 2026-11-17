import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";

import {
  FEATURE_RULES,
  GMAIL_FEATURES,
  featureStylesheet,
  findHook,
  guardedSelector,
  witnessSelector,
} from "#core/gmail-hooks.ts";
import type { HookName } from "#core/gmail-hooks.ts";

import { RECHECK_MS, checkHealth } from "./health.ts";

// Small, hand-written stand-ins for Gmail's markup, carrying only the anchors.
const LOGO =
  '<header><div><div><a href="#inbox"><img></a></div></div></header>';
const POLICY = '<a href="https://www.google.com/gmail/about/policy/">p</a>';
const FOOTER = `<div role="contentinfo">${POLICY}</div>`;
const PROMO = "<div data-rp-onramp-container><p>promo</p></div>";
const UPGRADE =
  '<header><div data-pep-id="global-pep-gmail" data-rp-onramp-container></div></header>';
const LIST = '<div gh="tl"><table></table></div>';
const REFRESH = '<div act="20"></div>';

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
  it("looks again 3 s later before calling a hook broken in a release", () => {
    expect(RECHECK_MS).toBe(3000);
  });

  it("matches every hook in an inbox that has them all", () => {
    expect(
      checkHealth(inbox(`${PROMO}${REFRESH}${LIST}${FOOTER}`))
    ).toStrictEqual({
      views: ["list"],
      hooks: {
        logo: "matched",
        footer: "matched",
        promo: "matched",
        upgrade: "matched",
        conversation: "absent",
        attachments: "absent",
        trimmed: "absent",
        trimmedToggle: "absent",
        refresh: "matched",
      },
    });
  });

  it("calls Refresh broken in a list without it, and only absent in a thread", () => {
    expect(checkHealth(inbox(LIST)).hooks.refresh).toBe("broken");
    expect(
      checkHealth(inbox(`<div hidden>${REFRESH}${LIST}</div>`)).hooks.refresh
    ).toBe("matched");
    expect(
      checkHealth(inbox('<h2 data-legacy-thread-id="1"></h2>')).hooks.refresh
    ).toBe("absent");
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
const SWALLOWING: Partial<
  Record<HookName, readonly ((inside: string) => string)[]>
> = {
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

/** Each hide and the hook of Gmail's chrome it takes. */
const HIDES = GMAIL_FEATURES.flatMap((feature) =>
  FEATURE_RULES[feature]
    .filter(({ hook }) => findHook(hook).scope === "chrome")
    .map(({ hook }) => [feature, hook] as const)
);

const anchorCases = HIDES.flatMap(([feature, name]) =>
  (SWALLOWING[name] ?? []).map(
    (wrap, index) =>
      [feature, name, index, findHook(name).anchors[index] ?? "", wrap] as const
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
    guarded: anchors.flatMap((anchor) =>
      select(root, guardedSelector(findHook(name), anchor))
    ),
  };
};

const GUARDED = { unguarded: true, guarded: [] };

describe("the guard on every hide", () => {
  it("has a swallowing container for every anchor", () => {
    for (const [, name] of HIDES) {
      expect(SWALLOWING[name]).toHaveLength(findHook(name).anchors.length);
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

// A thread as Gmail draws it, cut to the anchors and the classes the thread
// features take.
const ATTACHMENTS =
  '<div class="hq gt"><div class="hp"></div><span download_url="x"></span></div>';
const TRIMMED =
  '<div class="adL"><div class="adm"></div><div class="h5">q</div></div>';
/** Gmail's ••• button, which it puts before the quote it folds. */
const TOGGLE =
  '<div class="yj6qo ajU"><div class="ajR" role="button"></div></div>';
const GMAIL_TRIM = `${TOGGLE}${TRIMMED}`;

/** A message's body, with what Gmail inserts at its top level. */
const body = (inserted = "", mail = "<p>text</p>") =>
  `<div class="ii gt adO"><div class="a3s"><div>${mail}${inserted}</div></div></div>`;

/** An open message: its body, then its attachment block. */
const message = (inner = `${body()}${ATTACHMENTS}`) =>
  `<div data-message-id="#msg-a:r1"><div class="gs"><div>${inner}</div></div></div>`;

const item = (inner: string) =>
  `<div role="listitem"><div class="Bk"><div class="G2">${inner}</div></div></div>`;

const thread = (list: string) =>
  page(
    `${LOGO}<div role="main"><h2 data-legacy-thread-id="1"></h2>${list}</div>`,
    "#inbox/1"
  );

const MESSAGES = (items: string) => `<div role="list">${items}</div>`;

const FULL = MESSAGES(
  `${item("")}${item(message(`${body(`${TOGGLE}${TRIMMED}`)}${ATTACHMENTS}`))}`
);

describe("the thread's hooks", () => {
  it("matches each in a thread that has them all", () => {
    expect(checkHealth(thread(FULL))).toMatchObject({
      views: ["thread"],
      hooks: {
        conversation: "matched",
        attachments: "matched",
        trimmed: "matched",
        trimmedToggle: "matched",
      },
    });
  });

  it("calls the conversation broken when the thread's messages sit in no list", () => {
    expect(
      checkHealth(thread(`<div>${item(message())}</div>`)).hooks.conversation
    ).toBe("broken");
  });

  it("calls the attachments broken when a download tile shows outside every block", () => {
    const renamed = message(
      `${body()}<div class="renamed"><span download_url="x"></span></div>`
    );

    expect(checkHealth(thread(MESSAGES(item(renamed)))).hooks.attachments).toBe(
      "broken"
    );
  });

  it("takes no witness from mail: a download tile in a body leaves attachments absent", () => {
    const tile = '<span download_url="x"></span>';

    expect(
      checkHealth(thread(MESSAGES(item(message(body("", tile)))))).hooks
        .attachments
    ).toBe("absent");
  });

  it("never calls trimmed content broken, having no witness", () => {
    expect(checkHealth(thread(MESSAGES(item(message())))).hooks).toMatchObject({
      trimmed: "absent",
      trimmedToggle: "absent",
    });
  });
});

/** What each guarded anchor of a hook takes in a page. */
const taken = (name: HookName, html: string) => {
  const { root } = page(html);
  const hook = findHook(name);

  return {
    unguarded: hook.anchors.some((anchor) => select(root, anchor).length > 0),
    guarded: hook.anchors.flatMap((anchor) =>
      select(root, guardedSelector(hook, anchor))
    ),
  };
};

const IN_MAIN = (html: string) => `<div role="main">${html}</div>`;

/**
 * For each hook of a thread feature, where its anchors would match but must
 * take nothing: in a body as mail, in a draft, in an editable region, and
 * wherever its own match is or holds what it must never be.
 */
const WRONG: Record<
  "conversation" | "attachments" | "trimmed" | "trimmedToggle",
  Record<string, string>
> = {
  conversation: {
    "a body": IN_MAIN(message(body("", MESSAGES(item(message()))))),
    "a draft": IN_MAIN(
      `<div data-compose-id="c">${MESSAGES(item(message()))}</div>`
    ),
    "an editable region": IN_MAIN(
      `<div contenteditable="true">${MESSAGES(item(message()))}</div>`
    ),
    "the inbox's list": IN_MAIN(
      `<div role="list" gh="tl">${item(message())}</div>`
    ),
    "a list holding the inbox's list": IN_MAIN(
      MESSAGES(`${item(message())}<div gh="tl"></div>`)
    ),
    "a list holding the navigation": IN_MAIN(
      MESSAGES(`${item(message())}<div role="navigation"></div>`)
    ),
    "a list holding the main region": IN_MAIN(
      MESSAGES(`${item(message())}<div role="main"></div>`)
    ),
    "a list outside the main region": MESSAGES(item(message())),
  },
  attachments: {
    "a body": IN_MAIN(message(body("", ATTACHMENTS))),
    "a draft": IN_MAIN(
      message(`<div data-compose-id="c">${ATTACHMENTS}</div>`)
    ),
    "an editable region": IN_MAIN(
      message(`<div contenteditable="true">${ATTACHMENTS}</div>`)
    ),
    "a block that is the body": IN_MAIN(
      message('<div class="hq gt a3s"><span download_url="x"></span></div>')
    ),
    "a block holding the body": IN_MAIN(
      message(`<div class="hq gt">${body()}</div>`)
    ),
    "a block holding the message": IN_MAIN(
      `<div data-message-id="o"><div class="hq gt">${message(body())}</div></div>`
    ),
    "a block outside any message": IN_MAIN(ATTACHMENTS),
    "a block whose holder is the body": IN_MAIN(
      message(`<div class="a3s"><p>text</p>${ATTACHMENTS}</div>`)
    ),
  },
  trimmed: {
    "a draft": IN_MAIN(
      `<div data-message-id="m"><div data-compose-id="c">${body(GMAIL_TRIM)}</div></div>`
    ),
    "an editable region": IN_MAIN(
      `<div data-message-id="m"><div contenteditable="true">${body(GMAIL_TRIM)}</div></div>`
    ),
    "a body outside any message": IN_MAIN(body(GMAIL_TRIM)),
    "a part holding a message": IN_MAIN(
      message(body(`${TOGGLE}<div class="adL">${message()}</div>`))
    ),
    "a part that is the body": IN_MAIN(
      message(body(`${TOGGLE}<div class="adL a3s"></div>`))
    ),
    "a part holding the body": IN_MAIN(
      message(body(`${TOGGLE}<div class="adL"><div class="a3s"></div></div>`))
    ),
  },
  trimmedToggle: {
    "a draft": IN_MAIN(
      `<div data-message-id="m"><div data-compose-id="c">${body(TOGGLE)}</div></div>`
    ),
    "an editable region": IN_MAIN(
      `<div data-message-id="m"><div contenteditable="true">${body(TOGGLE)}</div></div>`
    ),
    "a toggle that is editable": IN_MAIN(
      message(
        body(
          '<div class="yj6qo ajU" contenteditable="true"><div class="ajR" role="button"></div></div>'
        )
      )
    ),
    "a toggle holding a draft": IN_MAIN(
      message(
        body(
          '<div class="yj6qo ajU"><div class="ajR" role="button"></div><div data-compose-id="c"></div></div>'
        )
      )
    ),
    "a toggle holding an editable region": IN_MAIN(
      message(
        body(
          '<div class="yj6qo ajU"><div class="ajR" role="button"></div><div contenteditable="true"></div></div>'
        )
      )
    ),
    "a toggle holding the body": IN_MAIN(
      message(
        body(
          '<div class="yj6qo ajU"><div class="ajR" role="button"></div><div class="a3s"></div></div>'
        )
      )
    ),
  },
};

/**
 * Where Gmail's trimmed parts' own shape refuses a match: a sender's
 * top-level element with Gmail's class, out of Gmail's order or without its
 * button, and anything deeper in the mail.
 */
const REFUSED: Record<"trimmed" | "trimmedToggle", Record<string, string>> = {
  trimmed: {
    "a sender's top-level .adL with no toggle before it": IN_MAIN(
      message(body('<div class="adL" style="display:none">s</div>'))
    ),
    "a sender's top-level .adL before Gmail's toggle": IN_MAIN(
      message(body(`${TRIMMED}${TOGGLE}`))
    ),
    "trimmed content deeper than Gmail inserts it": IN_MAIN(
      message(body("", `<div>${GMAIL_TRIM}</div>`))
    ),
  },
  trimmedToggle: {
    "a sender's top-level .ajU": IN_MAIN(
      message(body('<div class="ajU">s</div>'))
    ),
    "a sender's toggle without Gmail's button": IN_MAIN(
      message(body('<div class="yj6qo ajU"><div class="ajR">s</div></div>'))
    ),
    "a toggle deeper than Gmail inserts it": IN_MAIN(
      message(body("", `<div>${TOGGLE}</div>`))
    ),
  },
};

const refusedCases = Object.entries(REFUSED).flatMap(([name, cases]) =>
  Object.entries(cases).map(
    ([what, html]) => [name as HookName, what, html] as const
  )
);

const wrongCases = Object.entries(WRONG).flatMap(([name, cases]) =>
  Object.entries(cases).map(
    ([what, html]) => [name as HookName, what, html] as const
  )
);

describe("the guard on every thread feature", () => {
  it.each(Object.keys(WRONG) as HookName[])(
    "lets %s take its part where Gmail draws it",
    (name) => {
      expect(taken(name, IN_MAIN(FULL)).guarded).not.toHaveLength(0);
    }
  );

  it.each(wrongCases)(
    "keeps %s from taking a match in %s",
    (name, _what, html) => {
      // Each fixture fools the bare anchor; the guard is what holds.
      expect(taken(name, html)).toStrictEqual(GUARDED);
    }
  );

  it.each(refusedCases)(
    "keeps %s from taking %s by its anchor's own shape",
    (name, _what, html) => {
      expect(taken(name, html)).toStrictEqual({
        unguarded: false,
        guarded: [],
      });
    }
  );

  it("reverses only the innermost list when a list wraps the thread's", () => {
    const html = IN_MAIN(
      `<div role="list" id="outer"><div role="listitem">${MESSAGES(item(message()))}</div></div>`
    );

    expect(
      taken("conversation", html).guarded.map((each) => each.id)
    ).toStrictEqual([""]);
  });
});

/** The rules of a feature's stylesheet, by their selectors. */
const selectorsOf = (stylesheet: string) =>
  stylesheet.split("\n").map((rule) => rule.slice(0, rule.lastIndexOf(" { ")));

const isOrHoldsBody = (element: Element) =>
  element.matches(".a3s") || element.querySelector(".a3s") !== null;

describe("attachments at the top", () => {
  const [holder = "", block = ""] = selectorsOf(
    featureStylesheet("moveAttachmentsToTop")
  );

  it("heads the message's own part with its block, and nothing else", () => {
    const { root } = page(IN_MAIN(message()));

    expect(select(root, block).map((each) => each.className)).toStrictEqual([
      "hq gt",
    ]);
    expect(select(root, holder)).toStrictEqual(
      select(root, ".hq.gt").map((each) => each.parentElement)
    );
  });

  it.each(Object.entries(WRONG.attachments))(
    "never moves the body: in %s, what heads the column neither is nor holds it",
    (_what, html) => {
      const { root } = page(html);

      expect(select(root, block).filter(isOrHoldsBody)).toStrictEqual([]);
      expect(
        select(root, holder).filter((each) => each.closest(".a3s") !== null)
      ).toStrictEqual([]);
    }
  );
});

describe("reversed conversations", () => {
  it("reverses the thread's list alone, and redraws its separators on that list's items", () => {
    const { root } = page(IN_MAIN(FULL));
    const [list = "", every = "", last = ""] = selectorsOf(
      featureStylesheet("reverseConversation")
    );

    expect(select(root, list)).toStrictEqual(select(root, '[role="list"]'));
    expect(select(root, every)).toHaveLength(2);
    expect(select(root, last)).toStrictEqual(
      select(root, '[role="listitem"]:last-child .G2')
    );
  });
});

describe(witnessSelector, () => {
  it("reads a thread hook's witness only in Gmail's own part of a message", () => {
    const { root } = page(
      IN_MAIN(
        message(`${body("", '<span download_url="m"></span>')}${ATTACHMENTS}`)
      )
    );

    expect(
      select(
        root,
        witnessSelector(findHook("attachments"), "[download_url]")
      ).map((each) => each.getAttribute("download_url"))
    ).toStrictEqual(["x"]);
  });
});
