import {
  clipboard,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type WebContentsView,
} from "electron";
import electronContextMenu from "electron-context-menu";
import { accounts } from "./accounts";
import { licenseKey } from "./license-key";
import { createMeruMessageUrl } from "./protocol";
import { openExternalUrl } from "./url";

export function setupWindowContextMenu(window: BrowserWindow | WebContentsView) {
  electronContextMenu({
    window,
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
              label: "Copy Message Link",
              click: () => {
                clipboard.writeText(meruMessageUrl);
              },
            },
            {
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
            label: "Copy Link",
            click: () => {
              clipboard.writeText(window.webContents.getURL());
            },
          },
          {
            label: "Open in Default Browser",
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
        label: "Inspect Element",
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
