import { t } from "@lingui/core/macro";

import { menuItem } from "#core/context-menu.ts";
import { scrub } from "#core/log.ts";
import type { Log } from "#core/log.ts";
import {
  emailAddressOf,
  lookUpText,
  pageMenu,
  searchUrl,
  suggestionOf,
} from "#core/page-menu.ts";
import type {
  PageClick,
  PageHost,
  PageMenuItemId,
  SuggestionId,
} from "#core/page-menu.ts";
import type { Platform } from "#core/platform.ts";
import type { TabKey } from "#core/tabs.ts";
import type { Clipboard } from "#platform/clipboard.ts";
import type { PageMenuTarget } from "#platform/page-menu.ts";
import type { SystemBrowser } from "#platform/system-browser.ts";

import { roleLabel } from "./application-menu.ts";
import { nativeMenu } from "./context-menu.ts";
import type { Downloads } from "./downloads.ts";
import { MENU_LABELS } from "./menu-labels.ts";
import type { SenderIdentity } from "./senders.ts";

export interface PageMenuDeps {
  platform: Platform;
  /** What a web contents is, by its id, as the registry has it now. */
  identify: (webContentsId: number) => SenderIdentity | undefined;
  isGmailTab: (key: TabKey) => boolean;
  clipboard: Clipboard;
  /** Where Meru's own links open, as Open in Default Browser's do. */
  browser: SystemBrowser;
  downloads: Pick<Downloads, "saveAs">;
  log: Log;
}

type FixedId = Exclude<PageMenuItemId, SuggestionId>;

// Look Up's selection goes in after Lingui, which would decode `\xHH` and
// `\uHHHH` in a value it put in itself.
const SELECTION = "{selection}";

/** Each fixed item's label, in the person's language as it is when called. */
const LABELS: Record<FixedId, () => string> = {
  noGuesses: () =>
    t({
      message: "No Guesses Found",
      comment:
        "Disabled item of a page's context menu, in place of spelling suggestions, when the spell checker has none for the misspelt word",
    }),
  learnSpelling: () =>
    t({
      message: "Learn Spelling",
      comment:
        "Item of a page's context menu on a misspelt word that adds it to the dictionary, so it is no longer marked",
    }),
  lookUp: () =>
    t({
      message: `Look Up “${SELECTION}”`,
      comment:
        "Item of a page's context menu on macOS that shows the system's definition of the selected text; {selection} is that text, cut short",
    }),
  searchWithGoogle: () =>
    t({
      message: "Search with Google",
      comment:
        "Item of a page's context menu that searches Google for the selected text in the default browser",
    }),
  cut: () => roleLabel("cut", ""),
  copy: () => roleLabel("copy", ""),
  paste: () => roleLabel("paste", ""),
  pasteAndMatchStyle: () => roleLabel("pasteAndMatchStyle", ""),
  selectAll: () => roleLabel("selectAll", ""),
  saveImageAs: () =>
    t({
      message: "Save Image As…",
      comment:
        "Item of a page's context menu on an image that asks where to save it, then downloads it",
    }),
  copyImage: () =>
    t({
      message: "Copy Image",
      comment: "Item of a page's context menu that copies the image clicked",
    }),
  copyImageAddress: () =>
    t({
      message: "Copy Image Address",
      comment:
        "Item of a page's context menu that copies the address of the image clicked",
    }),
  copyEmailAddress: () =>
    t({
      message: "Copy Email Address",
      comment:
        "Item of a page's context menu on an email link that copies the address it writes to",
    }),
  copyLinkAddress: () =>
    t({
      message: "Copy Link Address",
      comment:
        "Item of a page's context menu on a link that copies where it goes",
    }),
  copyUrl: MENU_LABELS.copyUrl,
  openInBrowser: MENU_LABELS.openInBrowser,
  inspectElement: () =>
    t({
      message: "Inspect Element",
      comment:
        "Item of a page's context menu that opens the developer tools at the element clicked",
    }),
};

/** An item's label: a suggestion as Chromium gives it, Look Up with the selection. */
export const pageMenuLabel = (click: PageClick) => (id: PageMenuItemId) => {
  const suggestion = suggestionOf(click, id);

  if (suggestion !== undefined) {
    return suggestion;
  }

  const fixed = LABELS[id as FixedId]();

  return id === "lookUp"
    ? fixed.replace(SELECTION, () => lookUpText(click.selection))
    : fixed;
};

/** The text a copying item writes. */
const copied = (
  item: "copyImageAddress" | "copyEmailAddress" | "copyLinkAddress" | "copyUrl",
  click: PageClick,
  target: PageMenuTarget
) => {
  switch (item) {
    case "copyImageAddress": {
      return click.image?.url ?? "";
    }
    case "copyEmailAddress": {
      return emailAddressOf(click.linkUrl) ?? "";
    }
    case "copyLinkAddress": {
      return click.linkUrl;
    }
    default: {
      return target.url();
    }
  }
};

/**
 * Where a web contents is shown, if it is a page that gets the menu: a tab's
 * view or a window a page opened. Meru's own documents, and a web contents
 * the registry does not know, get none.
 */
export const pageHostOf = (
  identity: SenderIdentity | undefined,
  url: string,
  isGmailTab: (key: TabKey) => boolean
): PageHost | undefined => {
  switch (identity?.role) {
    case "content-view": {
      return { kind: "tab", gmail: isGmailTab(identity), url };
    }
    case "child-window": {
      return { kind: "child-window" };
    }
    default: {
      return undefined;
    }
  }
};

/**
 * The native menu of a right click in a page Meru shows, popped up at the
 * pointer in the frame clicked. Which web contents is a page, and whether it
 * is Gmail's tab, is read at the click; an item runs only if the menu,
 * worked out again as it is chosen, still offers it enabled.
 */
export const createPageMenu = ({
  platform,
  identify,
  isGmailTab,
  clipboard,
  browser,
  downloads,
  log,
}: PageMenuDeps) => {
  const act = async (
    item: PageMenuItemId,
    click: PageClick,
    target: PageMenuTarget
  ) => {
    const suggestion = suggestionOf(click, item);

    if (suggestion !== undefined) {
      target.replaceMisspelling(suggestion);

      return;
    }

    switch (item) {
      case "learnSpelling": {
        target.learnSpelling(click.misspelledWord);
        break;
      }
      case "lookUp": {
        target.lookUp();
        break;
      }
      case "searchWithGoogle": {
        await browser.open(searchUrl(click.selection));
        break;
      }
      case "cut":
      case "copy":
      case "paste":
      case "pasteAndMatchStyle":
      case "selectAll": {
        target.edit(item);
        break;
      }
      case "saveImageAs": {
        const url = click.image?.url ?? "";

        if (url === "") {
          // Chromium gives no address for an image past its longest URL.
          log("page-image-unsaved", { reason: "no-address" });
        } else {
          downloads.saveAs(url, target.download);
        }

        break;
      }
      case "copyImage": {
        target.copyImage();
        break;
      }
      case "copyImageAddress":
      case "copyEmailAddress":
      case "copyLinkAddress":
      case "copyUrl": {
        await clipboard.writeText(copied(item, click, target));
        break;
      }
      case "openInBrowser": {
        await browser.open(target.url());
        break;
      }
      default: {
        target.inspectElement();
      }
    }
  };

  return {
    /** Pops up the menu of a right click in the web contents `webContentsId`. */
    open: (webContentsId: number, click: PageClick, target: PageMenuTarget) => {
      const current = () => {
        const host = target.isDestroyed()
          ? undefined
          : pageHostOf(identify(webContentsId), target.url(), isGmailTab);

        return host && pageMenu(click, host, platform);
      };
      const entries = current();

      if (!entries) {
        return;
      }

      const choose = async (item: PageMenuItemId) => {
        try {
          if (menuItem(current(), item)?.enabled) {
            await act(item, click, target);
          } else {
            log("page-menu-refused", { item: scrub.token(item) });
          }
        } catch (error) {
          log("page-menu-failed", {
            item: scrub.token(item),
            error: scrub.error(error),
          });
        }
      };

      target.popup(
        nativeMenu(entries, { label: pageMenuLabel(click), choose })
      );
    },
  };
};

export type PageMenu = ReturnType<typeof createPageMenu>;
