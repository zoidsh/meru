import { menuOfGroups } from "./context-menu.ts";
import type { MenuEntry, MenuItemEntry } from "./context-menu.ts";
import type { Platform } from "./platform.ts";
import { opensInBrowser } from "./tab-menu.ts";

/** Every fixed item a page's context menu can hold, in the design's order. */
export const PAGE_MENU_ITEMS = [
  "noGuesses",
  "learnSpelling",
  "lookUp",
  "searchWithGoogle",
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "selectAll",
  "saveImageAs",
  "copyImage",
  "copyImageAddress",
  "copyEmailAddress",
  "copyLinkAddress",
  "copyUrl",
  "openInBrowser",
  "inspectElement",
] as const;

/** A spelling suggestion, by its place in Chromium's list. */
export type SuggestionId = `suggestion-${number}`;

export type PageMenuItemId = (typeof PAGE_MENU_ITEMS)[number] | SuggestionId;

/** What Chromium says of a right click in a page, as Meru reads it. */
export interface PageClick {
  editable: boolean;
  /** The selected text, `""` for none. */
  selection: string;
  /** The misspelt word under the pointer, `""` for none. */
  misspelledWord: string;
  /** Chromium's suggestions for it, in its order. */
  suggestions: readonly string[];
  /** The address of the link around the click, `""` for none. */
  linkUrl: string;
  /**
   * The image clicked, if any, with its address: `""` where Chromium gives
   * none, as for a `data:` image past the longest URL it handles.
   */
  image?: { url: string } | undefined;
  /** What Chromium says it can do there now. */
  edit: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

/** Where the page that was clicked is shown. */
export type PageHost =
  /** A tab's view, with the URL its page shows now. */
  | { kind: "tab"; gmail: boolean; url: string }
  /** A window a page opened, or the compose window of an email link. */
  | { kind: "child-window" };

const MAILTO = "mailto:";

const LOOK_UP_GRAPHEMES = 25;

/** The selection as Look Up's label quotes it: 25 graphemes at most, then an ellipsis. */
export const lookUpText = (selection: string) => {
  const graphemes: string[] = [];

  // Stops one past the limit, since a selection can be a whole page.
  for (const { segment } of new Intl.Segmenter(undefined, {
    granularity: "grapheme",
  }).segment(selection.trim())) {
    graphemes.push(segment);

    if (graphemes.length > LOOK_UP_GRAPHEMES) {
      return `${graphemes.slice(0, LOOK_UP_GRAPHEMES).join("")}…`;
    }
  }

  return graphemes.join("");
};

/**
 * The address a `mailto:` link writes to, without its query; none for
 * another link, or for one that names no address before its query.
 */
export const emailAddressOf = (linkUrl: string) => {
  if (!linkUrl.toLowerCase().startsWith(MAILTO)) {
    return;
  }

  const [address = ""] = linkUrl.slice(MAILTO.length).split("?", 1);
  let decoded = address;

  try {
    decoded = decodeURIComponent(address);
  } catch {
    // A malformed escape is copied as written.
  }

  return decoded.trim() === "" ? undefined : decoded;
};

/** Google's search for the selection. */
export const searchUrl = (selection: string) => {
  const url = new URL("https://www.google.com/search");

  url.searchParams.set("q", selection);

  return url.href;
};

/** The suggestion an id names, if Chromium gave it. */
export const suggestionOf = (click: PageClick, id: PageMenuItemId) =>
  id.startsWith("suggestion-")
    ? click.suggestions[Number(id.slice("suggestion-".length))]
    : undefined;

/**
 * Whether anything is selected. A right click on macOS selects what is under
 * the pointer, which between words is only white space.
 */
const hasSelection = (click: PageClick) => click.selection.trim() !== "";

type Item = MenuItemEntry<PageMenuItemId>;

const item = (id: PageMenuItemId, enabled = true): Item => ({
  kind: "item",
  id,
  enabled,
});

const spellingGroups = (click: PageClick): Item[][] => {
  if (!click.editable || click.misspelledWord === "") {
    return [];
  }

  return [
    click.suggestions.length === 0
      ? [item("noGuesses", false)]
      : click.suggestions.map((_suggestion, index) =>
          item(`suggestion-${index}`)
        ),
    [item("learnSpelling")],
  ];
};

const editGroup = (click: PageClick, platform: Platform): Item[] => {
  const { editable, edit } = click;
  const selected = hasSelection(click);

  return [
    ...(editable ? [item("cut", edit.canCut && selected)] : []),
    ...(editable || selected ? [item("copy", edit.canCopy && selected)] : []),
    ...(editable
      ? [
          item("paste", edit.canPaste),
          item("pasteAndMatchStyle", edit.canPaste),
        ]
      : []),
    ...(platform === "darwin" ? [] : [item("selectAll", edit.canSelectAll)]),
  ];
};

/**
 * A page's context menu, in the design's groups: spelling for a misspelt
 * word in a field, Look Up on macOS and Search with Google for a selection
 * off a link, the edit commands as Chromium enables them, the image's and
 * an email link's items, the link's, a tab's page items for a tab that is
 * not Gmail's, and Inspect Element.
 */
export const pageMenu = (
  click: PageClick,
  host: PageHost,
  platform: Platform
): MenuEntry<PageMenuItemId>[] => {
  const selected = hasSelection(click);
  const linked = click.linkUrl !== "";
  const { image } = click;

  return menuOfGroups<PageMenuItemId>([
    ...spellingGroups(click),
    platform === "darwin" && selected && !linked ? [item("lookUp")] : [],
    selected ? [item("searchWithGoogle")] : [],
    editGroup(click, platform),
    [
      ...(image
        ? [
            item("saveImageAs"),
            item("copyImage"),
            item("copyImageAddress", image.url !== ""),
          ]
        : []),
      ...(emailAddressOf(click.linkUrl) === undefined
        ? []
        : [item("copyEmailAddress")]),
    ],
    linked && !image ? [item("copyLinkAddress")] : [],
    host.kind === "tab" && !host.gmail
      ? [item("copyUrl"), item("openInBrowser", opensInBrowser(host.url))]
      : [],
    [item("inspectElement")],
  ]);
};
