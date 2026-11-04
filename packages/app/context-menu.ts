import { platform } from "@electron-toolkit/utils";
import { ph, t } from "@lingui/core/macro";
import { byPlatform } from "@meru/shared/platform";
import {
  type BrowserWindow,
  Menu,
  type MenuItemConstructorOptions,
  shell,
  type WebContentsView,
} from "electron";
import { CancelError, download } from "electron-dl";
import { serializeError } from "serialize-error";
import { accounts } from "./accounts";
import { copyBookmark, copyText } from "./lib/clipboard";
import { createMeruMessageUrl } from "./lib/deep-link";
import { log } from "./lib/log";
import { licenseKey } from "./license-key";
import { openExternalUrl } from "./url";

const LOOK_UP_MAX_GRAPHEMES = 25;

const MAILTO_PREFIX = "mailto:";

const SELECTION_PLACEHOLDER = "{selection}";

function getItemLabels() {
  // lingui-set comment="An item in the context menu of a page or a text field; & marks the access key on Windows and Linux"
  return {
    learnSpelling: platform.isMacOS
      ? t({ message: "&Learn Spelling", context: "macOS" })
      : t`&Learn Spelling`,
    lookUpSelection: t({
      message: `Look Up “${ph({ selection: SELECTION_PLACEHOLDER })}”`,
      context: "macOS",
      comment: "Context menu item on macOS; selection is the selected text",
    }),
    searchWithGoogle: platform.isMacOS
      ? t({ message: "&Search with Google", context: "macOS" })
      : t`&Search with Google`,
    cut: byPlatform(platform, {
      macOS: t({ message: "Cu&t", context: "macOS" }),
      windows: t({ message: "Cu&t", context: "Windows" }),
      linux: t({ message: "Cu&t", context: "Linux" }),
    }),
    copy: byPlatform(platform, {
      macOS: t({ message: "&Copy", context: "macOS" }),
      windows: t({ message: "&Copy", context: "Windows" }),
      linux: t({ message: "&Copy", context: "Linux" }),
    }),
    paste: byPlatform(platform, {
      macOS: t({ message: "&Paste", context: "macOS" }),
      windows: t({ message: "&Paste", context: "Windows" }),
      linux: t({ message: "&Paste", context: "Linux" }),
    }),
    pasteAndMatchStyle: byPlatform(platform, {
      macOS: t({ message: "Paste and &Match Style", context: "macOS" }),
      windows: t({ message: "Paste and &Match Style", context: "Windows" }),
      linux: t({ message: "Paste and &Match Style", context: "Linux" }),
    }),
    selectAll: byPlatform(platform, {
      macOS: undefined,
      windows: t({ message: "Select &All", context: "Windows" }),
      linux: t({ message: "Select &All", context: "Linux" }),
    }),
    saveImageAs: byPlatform(platform, {
      macOS: t({ message: "Sa&ve Image As…", context: "macOS" }),
      windows: t({ message: "Sa&ve Image As…", context: "Windows" }),
      linux: t({ message: "Sa&ve Image As…", context: "Linux" }),
    }),
    copyLink: platform.isMacOS
      ? t({
          message: "Copy Link Addr&ess",
          context: "macOS",
          comment: "Context menu item that copies the address of the clicked link",
        })
      : t({
          message: "Copy Link Addr&ess",
          comment:
            "Context menu item that copies the address of the clicked link; & marks the access key on Windows and Linux",
        }),
    copyImage: platform.isMacOS ? t({ message: "Cop&y Image", context: "macOS" }) : t`Cop&y Image`,
    copyImageAddress: platform.isMacOS
      ? t({ message: "C&opy Image Address", context: "macOS" })
      : t`C&opy Image Address`,
    copyEmailAddress: t`Copy Email Address`,
    noGuessesFound: t({
      message: "No Guesses Found",
      comment:
        "Disabled context menu item shown in place of spelling suggestions when there are none",
    }),
  };
  // lingui-reset
}

function truncateSelection(selection: string) {
  const graphemes: string[] = [];

  // Stops one past the limit, since the selection can be a whole page.
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    selection,
  )) {
    graphemes.push(segment);

    if (graphemes.length > LOOK_UP_MAX_GRAPHEMES) {
      return `${graphemes.slice(0, LOOK_UP_MAX_GRAPHEMES - 1).join("")}…`;
    }
  }

  return selection;
}

type View = BrowserWindow | WebContentsView;

type MenuContext = {
  view: View;
  parameters: Electron.ContextMenuParams;
  labels: ReturnType<typeof getItemLabels>;
  hasText: boolean;
};

type MenuItems = MenuItemConstructorOptions[];

function spellingItems({ view, parameters, labels, hasText }: MenuContext): MenuItems {
  const { dictionarySuggestions, isEditable, misspelledWord } = parameters;

  if (!hasText || !misspelledWord) {
    return [];
  }

  if (dictionarySuggestions.length === 0) {
    return [{ id: "noGuessesFound", label: labels.noGuessesFound, enabled: false }];
  }

  if (!isEditable) {
    return [];
  }

  return dictionarySuggestions.map((suggestion) => ({
    id: "dictionarySuggestions",
    label: suggestion,
    click: () => {
      view.webContents.replaceMisspelling(suggestion);
    },
  }));
}

function learnSpellingItems({ view, parameters, labels, hasText }: MenuContext): MenuItems {
  const { isEditable, misspelledWord } = parameters;

  if (!isEditable || !hasText || !misspelledWord) {
    return [];
  }

  return [
    {
      id: "learnSpelling",
      label: labels.learnSpelling,
      click: () => {
        view.webContents.session.addWordToSpellCheckerDictionary(misspelledWord);
      },
    },
  ];
}

function lookUpItems({ view, parameters, labels, hasText }: MenuContext): MenuItems {
  if (!platform.isMacOS || !hasText || parameters.linkURL) {
    return [];
  }

  const selection = truncateSelection(parameters.selectionText.trim()).replaceAll("&", "&&");

  return [
    {
      id: "lookUpSelection",
      // Added after Lingui, which decodes `\xHH` and `\uHHHH` in a message's
      // final text, and by a function, since a string would expand `$&`.
      label: labels.lookUpSelection.replace(SELECTION_PLACEHOLDER, () => selection),
      click: () => {
        view.webContents.showDefinitionForSelection();
      },
    },
  ];
}

function searchItems({ parameters, labels, hasText }: MenuContext): MenuItems {
  if (!hasText) {
    return [];
  }

  return [
    {
      id: "searchWithGoogle",
      label: labels.searchWithGoogle,
      click: () => {
        const url = new URL("https://www.google.com/search");

        url.searchParams.set("q", parameters.selectionText);

        shell.openExternal(url.toString());
      },
    },
  ];
}

function editItems({ view, parameters, labels, hasText }: MenuContext): MenuItems {
  const { editFlags, isEditable } = parameters;

  const items: MenuItems = [];

  if (isEditable) {
    items.push({
      id: "cut",
      label: labels.cut,
      enabled: editFlags.canCut && hasText,
      click: () => {
        view.webContents.cut();
      },
    });
  }

  if (isEditable || hasText) {
    items.push({
      id: "copy",
      label: labels.copy,
      enabled: editFlags.canCopy && hasText,
      click: () => {
        view.webContents.copy();
      },
    });
  }

  if (isEditable) {
    items.push(
      {
        id: "paste",
        label: labels.paste,
        enabled: editFlags.canPaste,
        click: () => {
          view.webContents.paste();
        },
      },
      {
        id: "pasteAndMatchStyle",
        label: labels.pasteAndMatchStyle,
        enabled: editFlags.canPaste,
        click: () => {
          view.webContents.pasteAndMatchStyle();
        },
      },
    );
  }

  if (!platform.isMacOS) {
    items.push({
      id: "selectAll",
      label: labels.selectAll,
      click: () => {
        view.webContents.selectAll();
      },
    });
  }

  return items;
}

function saveImageAs(view: View, url: string) {
  // electron-dl reads nothing off the view but `webContents`, so a `WebContentsView` serves.
  download(view as BrowserWindow, url, { saveAs: true }).catch((error: unknown) => {
    if (!(error instanceof CancelError)) {
      log.error("Failed to save the image", { error: serializeError(error) });
    }
  });
}

function imageAndEmailItems({ view, parameters, labels }: MenuContext): MenuItems {
  const { linkURL, mediaType, srcURL, x, y } = parameters;

  const items: MenuItems = [];

  if (mediaType === "image") {
    items.push(
      {
        id: "saveImageAs",
        label: labels.saveImageAs,
        click: () => {
          saveImageAs(view, srcURL);
        },
      },
      {
        id: "copyImage",
        label: labels.copyImage,
        click: () => {
          view.webContents.copyImageAt(x, y);
        },
      },
      {
        id: "copyImageAddress",
        label: labels.copyImageAddress,
        click: () => {
          copyBookmark(srcURL, srcURL);
        },
      },
    );
  }

  if (linkURL.startsWith(MAILTO_PREFIX)) {
    items.push({
      id: "copyEmailAddress",
      label: labels.copyEmailAddress,
      click: () => {
        copyText(linkURL.slice(MAILTO_PREFIX.length));
      },
    });
  }

  return items;
}

function linkItems({ parameters, labels }: MenuContext): MenuItems {
  const { linkText, linkURL, mediaType } = parameters;

  if (!linkURL || mediaType !== "none") {
    return [];
  }

  return [
    {
      id: "copyLink",
      label: labels.copyLink,
      click: () => {
        copyBookmark(linkText, linkURL);
      },
    },
  ];
}

function messageItems({ parameters }: MenuContext): MenuItems {
  const { gmail } = accounts.getSelectedAccount().instance;

  const { userEmail, messageId } = gmail;

  if (
    !licenseKey.isValid ||
    parameters.pageURL !== gmail.view.webContents.getURL() ||
    !userEmail ||
    !messageId
  ) {
    return [];
  }

  const meruMessageUrl = createMeruMessageUrl(userEmail, messageId);

  return [
    {
      label: t({ message: "Copy Message Link", context: "context menu" }),
      click: () => {
        copyText(meruMessageUrl);
      },
    },
    // `sharingItem` and the `shareMenu` role are macOS-only, and a role
    // ignores `click`, so elsewhere a Share item would have nothing to do.
    ...(platform.isMacOS
      ? [
          {
            label: t({ message: "Share", context: "macOS" }),
            role: "shareMenu" as const,
            sharingItem: {
              urls: [meruMessageUrl],
            },
          },
        ]
      : []),
  ];
}

function pageItems({ view }: MenuContext): MenuItems {
  if (view === accounts.getSelectedAccount().instance.gmail.view) {
    return [];
  }

  return [
    {
      label: t`Copy URL`,
      click: () => {
        copyText(view.webContents.getURL());
      },
    },
    {
      label: t`Open in Default Browser`,
      click: () => {
        openExternalUrl(view.webContents.getURL(), {
          skipTrustedHostCheck: true,
        });
      },
    },
  ];
}

function inspectItems({ view, parameters }: MenuContext): MenuItems {
  return [
    {
      label: t({
        message: "Inspect Element",
        comment: "Context menu item that opens the developer tools on the element clicked",
      }),
      click: () => {
        view.webContents.inspectElement(parameters.x, parameters.y);

        if (view.webContents.isDevToolsOpened()) {
          view.webContents.devToolsWebContents?.focus();
        }
      },
    },
  ];
}

function buildTemplate(view: View, parameters: Electron.ContextMenuParams): MenuItems {
  const context: MenuContext = {
    view,
    parameters,
    labels: getItemLabels(),
    hasText: parameters.selectionText.length > 0,
  };

  return [
    spellingItems,
    learnSpellingItems,
    lookUpItems,
    searchItems,
    editItems,
    imageAndEmailItems,
    linkItems,
    messageItems,
    pageItems,
    inspectItems,
  ]
    .map((section) => section(context))
    .filter((section) => section.length > 0)
    .flatMap((section, index) => (index === 0 ? section : [{ type: "separator" }, ...section]));
}

export function setupWindowContextMenu(view: View) {
  view.webContents.on("context-menu", (_event, parameters) => {
    // macOS adds Apple Writing Tools, Proofread among them, only to a menu
    // popped up with the frame it belongs to.
    Menu.buildFromTemplate(buildTemplate(view, parameters)).popup({
      frame: view.webContents.focusedFrame ?? undefined,
    });
  });
}
