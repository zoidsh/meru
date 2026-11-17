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

export const HOOK_NAMES = ["logo", "footer", "promo", "upgrade"] as const;

export type HookName = (typeof HOOK_NAMES)[number];

/**
 * One hook into Gmail's page. Every anchor applies, the most stable first;
 * each is one complex selector, so a bad one cannot void the others, and none
 * reads anything Gmail translates.
 */
export interface Hook {
  name: HookName;
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

export const HOOKS: readonly Hook[] = [
  {
    name: "logo",
    anchors: ['header div:has(> div > a[href="#inbox"] > img)'],
    requiredIn: "any",
  },
  {
    name: "footer",
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
    // The upgrade button is an onramp container too, but in the header.
    anchors: ['[role="main"] [data-rp-onramp-container]'],
    requiredIn: [],
  },
  {
    name: "upgrade",
    anchors: ['[data-pep-id="global-pep-gmail"]'],
    requiredIn: [],
    // The button is itself one of Google's onramp containers.
    witness: "header [data-rp-onramp-container]",
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

/** What an anchor's rule and the health check both select. */
export const guardedSelector = (anchor: string) => `${anchor}${HOOK_GUARD}`;

/** A witness in mail says nothing of Gmail's own parts. */
export const witnessSelector = (witness: string) =>
  `${witness}:not(${AUTHORED})`;

export const GMAIL_FEATURES = [
  "hideGmailLogo",
  "hideInboxFooter",
  "hidePromoBanner",
  "hideUpgradeButton",
] as const satisfies readonly SettingKey[];

export type GmailFeature = (typeof GMAIL_FEATURES)[number];

export type GmailFeatures = Record<GmailFeature, boolean>;

/** The hooks each hide hides, by name. */
export const HIDES: Record<GmailFeature, readonly HookName[]> = {
  hideGmailLogo: ["logo"],
  hideInboxFooter: ["footer"],
  hidePromoBanner: ["promo"],
  hideUpgradeButton: ["upgrade"],
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
 * The stylesheet a hide inserts while on: one rule per anchor, since a
 * selector the engine cannot parse drops the whole rule it is in.
 */
export const hideStylesheet = (feature: GmailFeature) =>
  HIDES[feature]
    .flatMap((name) => findHook(name).anchors)
    .map((anchor) => `${guardedSelector(anchor)} { display: none !important; }`)
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
