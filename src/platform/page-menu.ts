import { BaseWindow, BrowserWindow, app } from "electron";
import type { ContextMenuParams, WebContents } from "electron";

import type { PageClick } from "#core/page-menu.ts";

import type { ContextMenuItem, ContextMenus } from "./context-menu.ts";

export type EditCommand =
  | "cut"
  | "copy"
  | "paste"
  | "pasteAndMatchStyle"
  | "selectAll";

/** The page a right click was in, and what can be done there for that click. */
export interface PageMenuTarget {
  /** Its main frame's URL now. */
  url: () => string;
  /** Whether it is gone, so nothing can be done in it. */
  isDestroyed: () => boolean;
  /** Pops the menu up at the pointer, with the frame clicked. */
  popup: (items: readonly ContextMenuItem[]) => void;
  replaceMisspelling: (suggestion: string) => void;
  /** Into the session's own dictionary; on macOS, the system's. */
  learnSpelling: (word: string) => void;
  /** macOS's definition of the selection. */
  lookUp: () => void;
  edit: (command: EditCommand) => void;
  /** Copies the image clicked. */
  copyImage: () => void;
  /** Downloads `url` as the page would, through its session. */
  download: (url: string) => void;
  /** Opens the developer tools at the element clicked. */
  inspectElement: () => void;
}

export interface PageMenus {
  /**
   * Tells `listener` of each right click Chromium reports in any web contents
   * of the app, by its id: whose it is, and whether it gets a menu, is the
   * listener's to decide. A page that handles the click itself sends none.
   */
  watch: (
    listener: (
      webContentsId: number,
      click: PageClick,
      target: PageMenuTarget
    ) => void
  ) => void;
}

const clickOf = (params: ContextMenuParams): PageClick => ({
  editable: params.isEditable,
  selection: params.selectionText,
  misspelledWord: params.misspelledWord,
  suggestions: params.dictionarySuggestions,
  linkUrl: params.linkURL,
  ...(params.mediaType === "image" && { image: { url: params.srcURL } }),
  edit: {
    canCut: params.editFlags.canCut,
    canCopy: params.editFlags.canCopy,
    canPaste: params.editFlags.canPaste,
    canSelectAll: params.editFlags.canSelectAll,
  },
});

/** The window a page shows in: its own, or the one its view is put in. */
const windowOf = (contents: WebContents) =>
  BrowserWindow.fromWebContents(contents) ??
  BaseWindow.getAllWindows().find((window) =>
    window.contentView.children.some(
      (view) => "webContents" in view && view.webContents === contents
    )
  );

/** What a target does with what the system shares, the clipboard and the screen. */
type SystemActions = Pick<
  PageMenuTarget,
  "learnSpelling" | "lookUp" | "edit" | "copyImage" | "inspectElement"
>;

const systemActions = (
  contents: WebContents,
  params: ContextMenuParams
): SystemActions => ({
  learnSpelling: (word) => {
    contents.session.addWordToSpellCheckerDictionary(word);
  },
  lookUp: () => {
    contents.showDefinitionForSelection();
  },
  edit: (command) => {
    contents[command]();
  },
  copyImage: () => {
    contents.copyImageAt(params.x, params.y);
  },
  inspectElement: () => {
    contents.inspectElement(params.x, params.y);
  },
});

const watchWith =
  (
    menus: ContextMenus,
    actions: (contents: WebContents, params: ContextMenuParams) => SystemActions
  ): PageMenus["watch"] =>
  (listener) => {
    app.on("web-contents-created", (_event, contents) => {
      contents.on("context-menu", (_menuEvent, params) => {
        listener(contents.id, clickOf(params), {
          url: () => contents.getURL(),
          isDestroyed: () => contents.isDestroyed(),
          popup: (items) => {
            const window = windowOf(contents);

            // macOS adds its Writing Tools only to a menu given its frame.
            if (window) {
              menus.popup(window, items, undefined, params.frame ?? undefined);
            }
          },
          replaceMisspelling: (suggestion) => {
            contents.replaceMisspelling(suggestion);
          },
          download: (url) => {
            contents.downloadURL(url);
          },
          ...actions(contents, params),
        });
      });
    });
  };

export const createPageMenus = (menus: ContextMenus): PageMenus => ({
  watch: watchWith(menus, systemActions),
});

/**
 * The end-to-end build's: whatever would write the system's clipboard or
 * spelling dictionary, show macOS's definition or open the developer tools
 * is recorded on the main process's global under `meruTestPageActions`, in
 * order, and done nowhere.
 */
export const createCapturedPageMenus = (menus: ContextMenus): PageMenus => {
  const recorded: string[] = [];

  Reflect.set(globalThis, "meruTestPageActions", recorded);

  return {
    watch: watchWith(menus, () => ({
      learnSpelling: (word) => {
        recorded.push(`learnSpelling ${word}`);
      },
      lookUp: () => {
        recorded.push("lookUp");
      },
      edit: (command) => {
        recorded.push(command);
      },
      copyImage: () => {
        recorded.push("copyImage");
      },
      inspectElement: () => {
        recorded.push("inspectElement");
      },
    })),
  };
};
