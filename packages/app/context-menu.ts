import { ph, t } from "@lingui/core/macro";
import {
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type WebContentsView,
} from "electron";
import electronContextMenu, { type Labels } from "electron-context-menu";
import { accounts } from "./accounts";
import { copyText } from "./lib/clipboard";
import { createMeruMessageUrl } from "./lib/deep-link";
import { licenseKey } from "./license-key";
import { openExternalUrl } from "./url";

// electron-context-menu fills this in with the selected text itself.
const SELECTION_PLACEHOLDER = "{selection}";

// electron-context-menu's own items, keeping its ampersands, which mark the
// access key on Windows and Linux.
function getDefaultItemLabels(): Labels {
  // lingui-set comment="An item in the context menu of a page or a text field; & marks the access key on Windows and Linux"
  return {
    learnSpelling: t`&Learn Spelling`,
    lookUpSelection: t({
      message: `Look Up “${ph({ selection: SELECTION_PLACEHOLDER })}”`,
      comment: "Context menu item on macOS; selection is the selected text",
    }),
    searchWithGoogle: t`&Search with Google`,
    cut: t`Cu&t`,
    copy: t`&Copy`,
    paste: t`&Paste`,
    pasteAndMatchStyle: t`&Paste And Match Style`,
    selectAll: t`Select &All`,
    saveImage: t`Save I&mage`,
    saveImageAs: t`Sa&ve Image As…`,
    saveVideo: t`Save Vide&o`,
    saveVideoAs: t`Save Video& As…`,
    copyLink: t`Copy Lin&k`,
    saveLinkAs: t`Save Link As…`,
    copyImage: t`Cop&y Image`,
    copyImageAddress: t`C&opy Image Address`,
    copyVideoAddress: t`Copy Video Ad&dress`,
    copyEmailAddress: t`Copy Email Address`,
    inspect: t`I&nspect Element`,
    services: t`Services`,
    noGuessesFound: t({
      message: "No Guesses Found",
      comment:
        "Disabled context menu item shown in place of spelling suggestions when there are none",
    }),
  };
  // lingui-reset
}

export function setupWindowContextMenu(window: BrowserWindow | WebContentsView) {
  electronContextMenu({
    window,
    labels: getDefaultItemLabels(),
    showCopyImageAddress: true,
    showSaveImageAs: true,
    showInspectElement: false,
    showCopyEmailAddress: true,
    append: (_defaultActions, parameters) => {
      const menuItems: MenuItemConstructorOptions[] = [];

      const selectedAccount = accounts.getSelectedAccount();

      if (
        licenseKey.isValid &&
        parameters.pageURL === selectedAccount.instance.gmail.view.webContents.getURL()
      ) {
        const userEmail = selectedAccount.instance.gmail.userEmail;
        const messageId = selectedAccount.instance.gmail.messageId;

        if (userEmail && messageId) {
          const meruMessageUrl = createMeruMessageUrl(userEmail, messageId);

          menuItems.push(
            {
              label: t`Copy Message Link`,
              click: () => {
                copyText(meruMessageUrl);
              },
            },
            {
              label: t`Share`,
              role: "shareMenu",
              sharingItem: {
                urls: [meruMessageUrl],
              },
            },
            {
              type: "separator",
            },
          );
        }
      }

      if (window !== selectedAccount.instance.gmail.view) {
        menuItems.push(
          {
            label: t`Copy Link`,
            click: () => {
              copyText(window.webContents.getURL());
            },
          },
          {
            label: t`Open in Default Browser`,
            click: () => {
              openExternalUrl(window.webContents.getURL(), {
                skipTrustedHostCheck: true,
              });
            },
          },
          {
            type: "separator",
          },
        );
      }

      menuItems.push({
        label: t`Inspect Element`,
        click: () => {
          window.webContents.inspectElement(parameters.x, parameters.y);

          if (window.webContents.isDevToolsOpened()) {
            window.webContents.devToolsWebContents?.focus();
          }
        },
      });

      return menuItems;
    },
  });
}
