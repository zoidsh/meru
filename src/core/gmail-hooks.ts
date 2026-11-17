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
] as const;

export type HookName = (typeof HOOK_NAMES)[number];

/**
 * Where in Gmail's page a hook's part lives, which decides what its guard
 * keeps it from: Gmail's chrome, Gmail's own part of a message around its
 * body, what Gmail inserts into a body, or the list of a thread's messages.
 */
export type HookScope = "chrome" | "message" | "body" | "conversation";

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

/** A message's text as the sender wrote it, which Gmail renders in here. */
const BODY = ".a3s";

/** Gmail inserts its trimmed parts as children of the body's one wrapper. */
const BODY_TOP = `.adO > ${BODY} > div`;

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
    anchors: [`${BODY_TOP} > .adL`, `${BODY_TOP} > .adL > .h5`],
    requiredIn: [],
  },
  {
    name: "trimmedToggle",
    scope: "body",
    anchors: [`${BODY_TOP} > .ajU`],
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
 * Each scope's guard. A part of a message is inside one, and is never a
 * message, the body or a draft, nor holds one, nor sits in a draft; Gmail's
 * own part around the body never sits in it either. The thread's list is in
 * the main region and never in mail, and is never the inbox's list, the
 * navigation or the main region, nor holds them: reordering hides nothing,
 * so it may hold a draft, which moves with its message.
 */
const GUARDS: Record<HookScope, string> = {
  chrome: HOOK_GUARD,
  message: `:is(${MESSAGE} *):not(${isOrHolds([MESSAGE, BODY, ...EDITING])}, ${within([BODY, ...EDITING])})`,
  body: `:is(${MESSAGE} ${BODY} *):not(${isOrHolds([MESSAGE, BODY, ...EDITING])}, ${within(EDITING)})`,
  conversation: `:is([role="main"] *):not(${isOrHolds(['[gh="tl"]', '[role="navigation"]', '[role="main"]'])}, ${within([MESSAGE, ...EDITING])})`,
};

/**
 * The part of a message that holds its attachment block, and so the body
 * beside it: in a message, never in its body or a draft, never a message or a
 * draft nor holding one.
 */
const HOLDER_GUARD = `:is(${MESSAGE} *):not(${isOrHolds([MESSAGE, ...EDITING])}, ${within([BODY, ...EDITING])})`;

/** A witness in mail says nothing of Gmail's own parts. */
const WITNESS_GUARDS: Record<HookScope, string> = {
  chrome: `:not(${AUTHORED})`,
  message: `:is(${MESSAGE} *):not(${within([BODY, ...EDITING])})`,
  body: `:is(${MESSAGE} ${BODY} *):not(${within(EDITING)})`,
  conversation: `:is([role="main"] *):not(${within([MESSAGE, ...EDITING])})`,
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
] as const satisfies readonly SettingKey[];

export type GmailFeature = (typeof GMAIL_FEATURES)[number];

export type GmailFeatures = Record<GmailFeature, boolean>;

/**
 * One rule of a feature's stylesheet: one per anchor of its hook, taking each
 * guarded match, or what `target` reaches from it.
 */
export interface FeatureRule {
  hook: HookName;
  target?: (match: string, anchor: string) => string;
  declarations: string;
}

const hide = (hook: HookName): FeatureRule => ({
  hook,
  declarations: "display: none !important;",
});

/** Gmail's own line between messages, drawn above every one but the first. */
const SEPARATOR = (item: string) => (list: string) =>
  `${list} > [role="listitem"]${item} > .Bk > .G2`;

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
      target: SEPARATOR(""),
      declarations:
        "border-top: 1px solid rgba(100, 121, 143, 0.12) !important;",
    },
    {
      hook: "conversation",
      target: SEPARATOR(":last-child"),
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
 * The stylesheet a feature inserts while on: one rule per anchor, since a
 * selector the engine cannot parse drops the whole rule it is in.
 */
export const featureStylesheet = (feature: GmailFeature) =>
  FEATURE_RULES[feature]
    .flatMap(({ hook: name, target, declarations }) => {
      const hook = findHook(name);

      return hook.anchors.map((anchor) => {
        const match = guardedSelector(hook, anchor);

        return `${target ? target(match, anchor) : match} { ${declarations} }`;
      });
    })
    .join("\n");

export const HOOK_STATUSES = ["matched", "broken", "absent"] as const;

export type HookStatus = (typeof HOOK_STATUSES)[number];

/** Whether a hook's witness is on the page, and if so inside a match. */
export type Witness = "none" | "covered" | "uncovered";

export const isRequired = (hook: Hook, views: readonly GmailView[]) =>
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
