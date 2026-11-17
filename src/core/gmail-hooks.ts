import { DARK } from "./gmail-dark.ts";
import type { SettingKey } from "./settings.ts";

/**
 * The views of Gmail's page a hook can be required in. More than one can
 * show at once: a thread beside the list in the reading pane, compose over
 * either.
 */
export const GMAIL_VIEWS = ["list", "thread", "compose", "settings"] as const;

export type GmailView = (typeof GMAIL_VIEWS)[number];

/**
 * What tells each view, anchored on what Gmail uses for its own behaviour.
 * Settings is told by the location's hash alone.
 */
export const VIEW_ANCHORS = {
  /** Present while a thread is open too, so it counts only while visible. */
  list: '[gh="tl"]',
  thread: "h2[data-legacy-thread-id]",
  compose: "[data-compose-id]",
} as const satisfies Record<Exclude<GmailView, "settings">, string>;

export const HOOK_NAMES = [
  "logo",
  "footer",
  "promo",
  "upgrade",
  "conversation",
  "attachments",
  "trimmed",
  "trimmedToggle",
  "refresh",
  "darkPane",
  "darkPaneText",
  "darkCompose",
  "darkComposeText",
  "darkComposePaint",
  "editorCard",
  "bodyCard",
  "darkMenu",
  "darkMenuText",
  "darkMenuPaint",
  "darkDialog",
  "darkDialogText",
] as const;

export type HookName = (typeof HOOK_NAMES)[number];

/**
 * Where in Gmail's page a hook's part lives, which decides what its guard
 * keeps it from: Gmail's chrome, Gmail's own part of a message around its
 * body, what Gmail inserts into a body, or the list of a thread's messages.
 * The dark theme recolours rather than hides: a surface may hold mail, ink
 * is a colour that a card sets back, a leaf paints over what it holds and so
 * never holds or sits in mail, a card holds a body or the editor, and a popup
 * is a menu or dialog of Gmail's own, or its text, never one in a message.
 */
export type HookScope =
  | "chrome"
  | "message"
  | "body"
  | "conversation"
  | "surface"
  | "ink"
  | "leaf"
  | "card"
  | "popup";

/**
 * One hook into Gmail's page. Every anchor applies, the most stable first;
 * each is one complex selector, so a bad one cannot void the others, and none
 * reads anything Gmail translates.
 */
export interface Hook {
  name: HookName;
  scope: HookScope;
  anchors: readonly string[];
  /** Where a page with no match is broken; elsewhere it is only absent. */
  requiredIn: readonly GmailView[] | "any";
  /**
   * What says the hook's content is on the page: a visible witness that no
   * match contains, or is contained by, makes the hook broken.
   */
  witness?: string;
}

const POLICY_LINK = 'a[href*="/gmail/about/policy/"]';

const STORAGE_LINK = 'a[href*="/settings/storage"]';

const MESSAGE = "[data-message-id]";

/** A draft's text as its writer types it, which Gmail sends as written. */
const EDITOR = "[contenteditable]";

/** Gmail's docked compose window, apart from a reply inline in a thread. */
const DOCKED = ".AD";

/** The conversation pane, whose white is Gmail's literal, not a variable. */
const PANE = ".iY";

const MENU = '[role="menu"]';

const DIALOG = '[role="alertdialog"]';

/** Each of a surface's parts, as one anchor apiece. */
const parts = (surface: string, names: readonly string[]) =>
  names.map((name) => `${surface} ${name}`);

/** The dark theme's text in each surface, by what Gmail draws it as. */
const DARK_TEXT = {
  pane: {
    primary: parts(PANE, [".hP", ".gD"]),
    secondary: parts(PANE, [
      ".go",
      ".g3",
      ".hb",
      ".g2",
      ".aVW",
      // A collapsed message's snippet.
      ".g6",
      // The AI overview's line below its card and its link.
      ".lnBNA",
      ".R6DxZc",
      // A text button's label, such as Add to Drive.
      ".mUIrbf-anl",
    ]),
    button: parts(PANE, [".ams"]),
    icon: parts(PANE, ["svg.aoH"]),
  },
  compose: {
    primary: parts(DOCKED, [".a3I", ".a3E span", ".az2 .J-JN-M-I-Jm span"]),
    secondary: parts(DOCKED, [".gO", ".aB"]),
    divider: parts(DOCKED, [".aoD"]),
    icon: parts(DOCKED, ["svg.aoH"]),
  },
  menu: {
    primary: parts(MENU, [".J-N-Jz", ".VO", ".a21", ".Q2", ".ST"]),
    secondary: parts(MENU, [".asd", ".OG", ".Q5 > div"]),
    link: parts(MENU, [".Tj", ".OD"]),
  },
  dialog: {
    primary: parts(DIALOG, [".uW2Fw-bHp", "label", "input"]),
    link: parts(DIALOG, [".mUIrbf-anl"]),
  },
} as const;

/** What paints over or through what it holds, rather than colouring text. */
const DARK_PAINT = {
  compose: {
    sprite: parts(DOCKED, [".btC .aaA", ".btC .og", ".btC .J-JN-M-I-JG"]),
  },
  menu: {
    hover: parts(MENU, [".J-N-JT"]),
    sprite: parts(MENU, [".J-N-JX"]),
    divider: parts(MENU, [".J-Kh"]),
  },
} as const;

const PANE_SURFACE = {
  pane: [PANE],
  // The reply bar sticks to the pane's bottom over the thread, so it takes
  // the pane's own colour, opaque, as Gmail's white is.
  stickyBar: parts(PANE, [".btDi4d"]),
  // The white around a reply's own card.
  bars: parts(PANE, [".nr.wR", ".aC2"]),
  // The reply's Send bar, once it sticks to the bottom: Gmail draws its white
  // 8 px wider than the reply's card, as a pseudo-element, and a white strip
  // below it that hides what scrolls beneath, both unseen on its white pane.
  sendBar: parts(PANE, [".aDj.ahe"]),
  belowSendBar: parts(PANE, [".aC3"]),
} as const;

const COMPOSE_SURFACE = {
  window: parts(DOCKED, [".aaZ"]),
  header: parts(DOCKED, [".l.m"]),
  clear: parts(DOCKED, [".aGb", ".aDj", ".qz", "input.agP", "input.aoT"]),
} as const;

/** A message's text as the sender wrote it, which Gmail renders in here. */
const BODY = ".a3s";

/**
 * Gmail inserts its trimmed parts beside the sender's own top-level elements,
 * in the body's one wrapper: its ••• button, then the folded quote after it.
 * Only these classes and this shape tell them from mail.
 */
const TRIMMED_TOGGLE = `.adO > ${BODY} > div > .yj6qo.ajU:has(> .ajR[role="button"])`;

export const HOOKS: readonly Hook[] = [
  {
    name: "logo",
    scope: "chrome",
    anchors: ['header div:has(> div > a[href="#inbox"] > img)'],
    requiredIn: "any",
  },
  {
    name: "footer",
    scope: "chrome",
    anchors: [
      `[role="contentinfo"]:has(${POLICY_LINK})`,
      // With the reading pane on, the footer's parts are in the pane's
      // placeholder, outside any contentinfo and beside its own heading.
      `.apa .apO:has(${POLICY_LINK})`,
      `.apa .apc:has(${STORAGE_LINK})`,
    ],
    requiredIn: [],
    witness: POLICY_LINK,
  },
  {
    name: "promo",
    scope: "chrome",
    // The upgrade button is an onramp container too, but in the header.
    anchors: ['[role="main"] [data-rp-onramp-container]'],
    requiredIn: [],
  },
  {
    name: "upgrade",
    scope: "chrome",
    anchors: ['[data-pep-id="global-pep-gmail"]'],
    requiredIn: [],
    // The button is itself one of Google's onramp containers.
    witness: "header [data-rp-onramp-container]",
  },
  {
    name: "conversation",
    scope: "conversation",
    // A collapsed message's item holds no message id; the open one's does.
    anchors: [`[role="list"]:has(> [role="listitem"] ${MESSAGE})`],
    requiredIn: ["thread"],
    witness: MESSAGE,
  },
  {
    name: "attachments",
    scope: "message",
    anchors: [".hq.gt"],
    requiredIn: [],
    witness: "[download_url]",
  },
  {
    name: "trimmed",
    scope: "body",
    anchors: [`${TRIMMED_TOGGLE} ~ .adL`, `${TRIMMED_TOGGLE} ~ .adL > .h5`],
    requiredIn: [],
  },
  {
    name: "trimmedToggle",
    scope: "body",
    anchors: [TRIMMED_TOGGLE],
    requiredIn: [],
  },
  {
    name: "refresh",
    scope: "chrome",
    // Gmail's action code for its Refresh control, which stays in the page,
    // hidden, while a thread is open.
    anchors: ['div[act="20"]'],
    requiredIn: ["list"],
  },
  {
    name: "darkPane",
    scope: "surface",
    anchors: Object.values(PANE_SURFACE).flat(),
    requiredIn: ["thread"],
    witness: "h2[data-legacy-thread-id]",
  },
  {
    name: "darkPaneText",
    scope: "ink",
    anchors: Object.values(DARK_TEXT.pane).flat(),
    requiredIn: ["thread"],
  },
  {
    name: "darkCompose",
    scope: "surface",
    anchors: Object.values(COMPOSE_SURFACE).flat(),
    requiredIn: [],
    // A reply inline in a thread is compose too, but in no window.
    witness: '[role="dialog"] [data-compose-id]',
  },
  {
    name: "darkComposeText",
    scope: "ink",
    anchors: Object.values(DARK_TEXT.compose).flat(),
    requiredIn: [],
  },
  {
    name: "darkComposePaint",
    scope: "leaf",
    anchors: Object.values(DARK_PAINT.compose).flat(),
    requiredIn: [],
  },
  {
    name: "editorCard",
    scope: "card",
    // The editor's own cell, white in Gmail's compose and inline reply alike.
    anchors: ['td.Ap:has([g_editable="true"])'],
    requiredIn: ["compose"],
    witness: '[g_editable="true"]',
  },
  {
    name: "bodyCard",
    scope: "card",
    anchors: [`.ii.gt:has(> ${BODY})`],
    requiredIn: ["thread"],
    witness: BODY,
  },
  {
    name: "darkMenu",
    scope: "popup",
    // Quick settings is one of Gmail's menus too.
    anchors: [MENU],
    requiredIn: [],
  },
  {
    name: "darkMenuText",
    scope: "popup",
    anchors: Object.values(DARK_TEXT.menu).flat(),
    requiredIn: [],
  },
  {
    name: "darkMenuPaint",
    scope: "leaf",
    anchors: Object.values(DARK_PAINT.menu).flat(),
    requiredIn: [],
  },
  {
    name: "darkDialog",
    scope: "popup",
    anchors: [DIALOG],
    requiredIn: [],
  },
  {
    name: "darkDialogText",
    scope: "popup",
    anchors: Object.values(DARK_TEXT.dialog).flat(),
    requiredIn: [],
  },
];

/** What no hide may ever take, nor anything holding it. */
const PROTECTED = [
  '[gh="tl"]',
  "[data-legacy-thread-id]",
  "[data-message-id]",
  "[data-compose-id]",
  '[role="main"]',
  '[role="navigation"]',
  "input",
  "textarea",
  "[contenteditable]",
].join(", ");

/**
 * Where what matches is a person's mail or writing, not Gmail's chrome: a
 * message linking to Gmail's policy page is no footer.
 */
const AUTHORED = [
  "[data-message-id] *",
  "[data-compose-id] *",
  "[contenteditable] *",
].join(", ");

/**
 * Whatever an anchor matches, it is never something protected, nor holds one,
 * nor sits in mail, so a hook Gmail's markup moved does nothing rather than
 * hide the wrong thing.
 */
export const HOOK_GUARD = `:not(${PROTECTED}, :has(${PROTECTED}), ${AUTHORED})`;

const EDITING = ["[data-compose-id]", "[contenteditable]"];

const isOrHolds = (selectors: readonly string[]) =>
  `${selectors.join(", ")}, :has(${selectors.join(", ")})`;

const within = (selectors: readonly string[]) =>
  selectors.map((selector) => `${selector} *`).join(", ");

/**
 * Another list of messages below the subject. Spelled from the subject's
 * children because linkedom, which the unit tests select with, lets a bare
 * `:has(a b)` find `a` at the subject itself.
 */
const NESTED_LIST = `> [role="list"] ${MESSAGE}, > * [role="list"] ${MESSAGE}`;

/**
 * Each scope's guard. A part of a message is inside one, and is never a
 * message, the body or a draft, nor holds one, nor sits in a draft; Gmail's
 * own part around the body never sits in it either. The thread's list is in
 * the main region and never in mail, and is never the inbox's list, the
 * navigation or the main region, nor holds them or another list of
 * messages: reordering hides nothing, so it may hold a draft, which moves
 * with its message.
 *
 * Surfaces, ink and popups never test what they hold: a `:has` on each of
 * the dark theme's text rules made opening a thread recalculate style about
 * 8 to 15% longer, against 3.5% without. A surface and ink set only colours
 * and a background, which the card at each body and editor sets back to
 * Gmail's own, so both take the same guard and may sit in a message. A popup
 * and its text are refused anywhere in a message, since Gmail draws its
 * menus and dialogs outside them. Whatever paints over what it holds is a
 * leaf, which keeps the test.
 */
const OUTSIDE_MAIL = `:not(${MESSAGE}, ${BODY}, ${EDITOR}, ${within([BODY, EDITOR])})`;

const OUTSIDE_MESSAGES = `:not(${MESSAGE}, ${BODY}, ${EDITOR}, ${within([MESSAGE, BODY, EDITOR])})`;

const GUARDS: Record<HookScope, string> = {
  chrome: HOOK_GUARD,
  message: `:is(${MESSAGE} *):not(${isOrHolds([MESSAGE, BODY, ...EDITING])}, ${within([BODY, ...EDITING])})`,
  body: `:is(${MESSAGE} ${BODY} *):not(${isOrHolds([MESSAGE, BODY, ...EDITING])}, ${within(EDITING)})`,
  conversation: `:is([role="main"] *):not(${isOrHolds(['[gh="tl"]', '[role="navigation"]', '[role="main"]'])}, :has(${NESTED_LIST}), ${within([MESSAGE, ...EDITING])})`,
  surface: OUTSIDE_MAIL,
  ink: OUTSIDE_MAIL,
  leaf: `:not(${isOrHolds([MESSAGE, BODY, EDITOR])}, ${within([MESSAGE, BODY, EDITOR])})`,
  card: `:is(${MESSAGE} *, [data-compose-id] *):not(${MESSAGE}, ${BODY}, ${EDITOR}, :has(${MESSAGE}), ${within([BODY, EDITOR])})`,
  popup: OUTSIDE_MESSAGES,
};

/**
 * The part of a message that holds its attachment block, and so the body
 * beside it: in a message, never the body nor in it, never in a draft, never a
 * message or a draft nor holding one.
 */
const HOLDER_GUARD = `:is(${MESSAGE} *):not(${isOrHolds([MESSAGE, ...EDITING])}, ${BODY}, ${within([BODY, ...EDITING])})`;

/** A witness in mail says nothing of Gmail's own parts. */
const WITNESS_GUARDS: Record<HookScope, string> = {
  chrome: `:not(${AUTHORED})`,
  message: `:is(${MESSAGE} *):not(${within([BODY, ...EDITING])})`,
  body: `:is(${MESSAGE} ${BODY} *):not(${within(EDITING)})`,
  conversation: `:is([role="main"] *):not(${within([MESSAGE, ...EDITING])})`,
  surface: `:not(${AUTHORED})`,
  ink: `:not(${AUTHORED})`,
  leaf: `:not(${AUTHORED})`,
  card: `:is(${MESSAGE} *, [data-compose-id] *):not(${within([EDITOR])})`,
  popup: `:not(${AUTHORED})`,
};

/** What an anchor's rule and the health check both select. */
export const guardedSelector = (hook: Hook, anchor: string) =>
  `${anchor}${GUARDS[hook.scope]}`;

export const witnessSelector = (hook: Hook, witness: string) =>
  `${witness}${WITNESS_GUARDS[hook.scope]}`;

export const GMAIL_FEATURES = [
  "hideGmailLogo",
  "hideInboxFooter",
  "hidePromoBanner",
  "hideUpgradeButton",
  "reverseConversation",
  "moveAttachmentsToTop",
  "showTrimmedContent",
  "extendDarkTheme",
] as const satisfies readonly SettingKey[];

export type GmailFeature = (typeof GMAIL_FEATURES)[number];

export type GmailFeatures = Record<GmailFeature, boolean>;

/**
 * One rule of a feature's stylesheet: one per anchor of its hook, taking each
 * guarded match, or what `target` reaches from it.
 */
export interface FeatureRule {
  hook: HookName;
  /** The hook's anchors the rule takes, when not all of them. */
  only?: readonly string[];
  target?: (match: string, anchor: string) => string;
  declarations: string;
}

const hide = (hook: HookName): FeatureRule => ({
  hook,
  declarations: "display: none !important;",
});

/** Gmail's own line between messages, drawn above every one but the first. */
const SEPARATOR = (item: string) => (list: string) =>
  `${list} > ${item} > .Bk > .G2`;

const ITEM = '[role="listitem"]';

const paint = (
  hook: HookName,
  only: readonly string[] | undefined,
  declarations: Record<string, string>
): FeatureRule => ({
  hook,
  ...(only ? { only } : {}),
  declarations: Object.entries(declarations)
    .map(([property, value]) => `${property}: ${value} !important;`)
    .join(" "),
});

const TEXT = { color: DARK.text };
const SECONDARY = { color: DARK.secondary };
const LINK = { color: DARK.link };
const ICON = { fill: DARK.secondary };
// Gmail's light-theme sprites are a dark grey on clear, so inverted they
// are a light one.
const SPRITE = { filter: "invert(1)" };
const DIVIDER = { "border-color": DARK.divider };

/**
 * A card keeps Gmail's own white, and Gmail's own text colour for whatever
 * inherits it, so a body or a draft reads exactly as Gmail draws it.
 */
const CARD = {
  "background-color": DARK.card,
  color: DARK.cardText,
  "border-radius": "8px",
};

/**
 * A body's card reaches past it on either side by two copies of itself
 * rather than padding, so mail keeps the width Gmail gives it; Gmail leaves
 * 8 px above a body, too little for a spread, so it grows downward instead.
 */
const BODY_CARD = {
  ...CARD,
  "padding-block": "12px",
  "box-shadow": `-12px 0 0 ${DARK.card}, 12px 0 0 ${DARK.card}`,
};

/** The rules each feature inserts while on, by the hooks they take. */
export const FEATURE_RULES: Record<GmailFeature, readonly FeatureRule[]> = {
  hideGmailLogo: [hide("logo")],
  hideInboxFooter: [hide("footer")],
  hidePromoBanner: [hide("promo")],
  hideUpgradeButton: [hide("upgrade")],
  // Visual only: focus, Gmail's n and p and a screen reader keep the DOM's
  // order, oldest first. reading-flow would make Tab follow the screen, but
  // Chromium then skips every message, since each item has tabindex -1.
  reverseConversation: [
    {
      hook: "conversation",
      declarations:
        "display: flex !important; flex-direction: column-reverse !important;",
    },
    {
      hook: "conversation",
      target: SEPARATOR(ITEM),
      declarations:
        "border-top: 1px solid rgba(100, 121, 143, 0.12) !important;",
    },
    {
      hook: "conversation",
      target: SEPARATOR(`:nth-last-child(1 of ${ITEM})`),
      declarations: "border-top: none !important;",
    },
  ],
  // The block's own message part becomes a column it heads, so no node moves;
  // without a guarded block, the column keeps the DOM's order.
  moveAttachmentsToTop: [
    {
      hook: "attachments",
      target: (_block, anchor) => `:has(> ${anchor})${HOLDER_GUARD}`,
      declarations:
        "display: flex !important; flex-direction: column !important;",
    },
    {
      hook: "attachments",
      declarations:
        "order: -1 !important; padding-bottom: 16px !important; border-bottom: 1px dotted rgb(216, 216, 216) !important;",
    },
  ],
  showTrimmedContent: [
    { hook: "trimmed", declarations: "display: block !important;" },
    hide("trimmedToggle"),
  ],
  // Inserted only while Gmail itself is Dark. Inherited colour is set on the
  // surfaces above mail and set back to Gmail's own at each card.
  extendDarkTheme: [
    paint("darkPane", [...PANE_SURFACE.pane, ...PANE_SURFACE.bars], {
      "background-color": "transparent",
      ...TEXT,
    }),
    paint("darkPane", PANE_SURFACE.sendBar, {
      "background-color": DARK.card,
    }),
    {
      ...paint("darkPane", PANE_SURFACE.sendBar, {
        "background-color": "transparent",
      }),
      target: (match) => `${match}::after`,
    },
    paint(
      "darkPane",
      [...PANE_SURFACE.stickyBar, ...PANE_SURFACE.belowSendBar],
      {
        "background-color": DARK.surface,
      }
    ),
    paint("darkPaneText", DARK_TEXT.pane.primary, TEXT),
    paint("darkPaneText", DARK_TEXT.pane.secondary, SECONDARY),
    paint("darkPaneText", DARK_TEXT.pane.button, {
      ...TEXT,
      "border-color": DARK.outline,
    }),
    paint("darkPaneText", DARK_TEXT.pane.icon, ICON),
    paint("darkCompose", COMPOSE_SURFACE.window, {
      "background-color": DARK.surface,
      ...TEXT,
    }),
    paint("darkCompose", COMPOSE_SURFACE.header, {
      "background-color": DARK.raised,
    }),
    paint("darkCompose", COMPOSE_SURFACE.clear, {
      "background-color": "transparent",
      ...TEXT,
    }),
    paint("darkComposeText", DARK_TEXT.compose.primary, TEXT),
    paint("darkComposeText", DARK_TEXT.compose.secondary, SECONDARY),
    paint("darkComposePaint", DARK_PAINT.compose.sprite, SPRITE),
    paint("darkComposeText", DARK_TEXT.compose.divider, DIVIDER),
    paint("darkComposeText", DARK_TEXT.compose.icon, ICON),
    paint("editorCard", undefined, CARD),
    paint("bodyCard", undefined, BODY_CARD),
    paint("darkMenu", undefined, {
      "background-color": DARK.surface,
      ...TEXT,
    }),
    paint("darkMenuText", DARK_TEXT.menu.primary, TEXT),
    paint("darkMenuText", DARK_TEXT.menu.secondary, SECONDARY),
    paint("darkMenuText", DARK_TEXT.menu.link, LINK),
    paint("darkMenuPaint", DARK_PAINT.menu.hover, {
      "background-color": DARK.hover,
    }),
    paint("darkMenuPaint", DARK_PAINT.menu.divider, DIVIDER),
    paint("darkMenuPaint", DARK_PAINT.menu.sprite, SPRITE),
    paint("darkDialog", undefined, {
      "background-color": DARK.surface,
      ...TEXT,
    }),
    paint("darkDialogText", DARK_TEXT.dialog.primary, TEXT),
    paint("darkDialogText", DARK_TEXT.dialog.link, LINK),
  ],
};

export const findHook = (name: HookName): Hook => {
  const hook = HOOKS.find((candidate) => candidate.name === name);

  if (!hook) {
    throw new Error(`No hook is named ${name}`);
  }

  return hook;
};

/** The settings a page's switches follow, one for one. */
export const gmailFeatures = (
  read: (feature: GmailFeature) => boolean
): GmailFeatures =>
  Object.fromEntries(
    GMAIL_FEATURES.map((feature) => [feature, read(feature)])
  ) as GmailFeatures;

/**
 * What a page inserts: each switch as it is, but the dark theme only while
 * Gmail's own theme is Dark and no card is broken, since mail outside its
 * card would be the sender's dark text on the dark pane.
 */
export const insertedFeatures = (
  switches: GmailFeatures,
  page: { dark: boolean; cardsBroken: boolean }
): GmailFeatures => ({
  ...switches,
  extendDarkTheme: switches.extendDarkTheme && page.dark && !page.cardsBroken,
});

/**
 * The stylesheet a feature inserts while on: one rule per anchor, since a
 * selector the engine cannot parse drops the whole rule it is in.
 */
export const featureStylesheet = (feature: GmailFeature) =>
  FEATURE_RULES[feature]
    .flatMap(({ hook: name, only, target, declarations }) => {
      const hook = findHook(name);

      return (only ?? hook.anchors).map((anchor) => {
        const match = guardedSelector(hook, anchor);

        return `${target ? target(match, anchor) : match} { ${declarations} }`;
      });
    })
    .join("\n");

export const HOOK_STATUSES = ["matched", "broken", "absent"] as const;

export type HookStatus = (typeof HOOK_STATUSES)[number];

/** Whether a hook's witness is on the page, and if so inside a match. */
export type Witness = "none" | "covered" | "uncovered";

const isRequired = (hook: Hook, views: readonly GmailView[]) =>
  hook.requiredIn === "any"
    ? views.length > 0
    : hook.requiredIn.some((view) => views.includes(view));

/**
 * A hook is broken when its content is on the page and it misses it: its
 * witness shows outside every match, or it matches nothing in a view that
 * always has it. Missing anywhere else, it is absent, which says nothing.
 */
export const decideHook = (
  hook: Hook,
  views: readonly GmailView[],
  matched: boolean,
  witness: Witness
): HookStatus => {
  if (witness === "uncovered") {
    return "broken";
  }

  if (matched) {
    return "matched";
  }

  return isRequired(hook, views) ? "broken" : "absent";
};

/** The views a page shows, from what its view anchors found and its hash. */
export const detectViews = (
  found: Record<keyof typeof VIEW_ANCHORS, boolean>,
  hash: string
): GmailView[] =>
  GMAIL_VIEWS.filter((view) =>
    view === "settings" ? hash.startsWith("#settings") : found[view]
  );
