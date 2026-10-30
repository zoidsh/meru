import { app } from "electron";
import { accounts } from "@/accounts";
import { config } from "@/config";
import { isWebUrl } from "@/lib/deep-link";
import { Popup } from "@/lib/popup";
import { main } from "@/main";
import { openExternalUrl } from "@/url";

function openWebUrlExternally(url: string) {
  if (isWebUrl(url)) {
    openExternalUrl(url);
  }
}

/**
 * The release notes, drawn over the whole main window. They are GitHub release
 * bodies, so the page gets no preload: whatever slips past its sanitizing has
 * no bridge to the main process to reach. It never closes on blur, only on
 * Escape, its close button or a click on the dimmed app behind it.
 */
class WhatsNew {
  private popup = new Popup();

  get isOpen() {
    return this.popup.webContents !== null;
  }

  open() {
    main.show();

    if (this.isOpen) {
      this.focus();

      return;
    }

    this.popup.toggle(main.window, {
      page: "release-notes",
      searchParams: new URLSearchParams({
        version: app.getVersion(),
        channel: config.get("updates.channel"),
      }),
      width: "fill",
      height: "fill",
      preload: false,
      closeOnEscape: true,
      onDismiss: () => {
        main.window.webContents.focus();

        accounts.focusActiveView();
      },
    });

    const { webContents } = this.popup;

    if (!webContents) {
      return;
    }

    // Links in the notes, and the error state's link to GitHub, open in the
    // browser, and the page itself never goes anywhere else.
    webContents.setWindowOpenHandler(({ url }) => {
      openWebUrlExternally(url);

      return { action: "deny" };
    });

    webContents.on("will-navigate", (event, url) => {
      event.preventDefault();

      openWebUrlExternally(url);
    });

    webContents.focus();
  }

  focus() {
    this.popup.webContents?.focus();
  }

  close() {
    this.popup.close();
  }
}

export const whatsNew = new WhatsNew();
