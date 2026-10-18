import {
  activateLocale,
  type CatalogTag,
  resolveLocale,
  SHIPPED_CATALOG_TAGS,
} from "@meru/shared/i18n";
import { app } from "electron";
import { config } from "@/config";
import { getRendererWebContents, ipc } from "@/ipc";
import { appMenu } from "@/menu";
import { appTray } from "@/tray";

class AppI18n {
  /**
   * The catalog the interface is drawn from. `"system"` and a tag this build no
   * longer ships both resolve against the preferred system languages, which
   * Electron only answers for once the app is ready.
   *
   * Nothing passes `--lang` or appends a `lang` switch: that would move
   * `navigator.language`, the `Accept-Language` the embedded views send and the
   * spellchecker's defaults along with it, and all three follow the OS.
   */
  get locale(): CatalogTag {
    const language = config.get("app.language");

    if (language !== "system" && SHIPPED_CATALOG_TAGS.includes(language)) {
      return language;
    }

    return resolveLocale(app.getPreferredSystemLanguages(), SHIPPED_CATALOG_TAGS);
  }

  /**
   * Called before the menu, the tray and the first renderer load, each of which
   * reads the active catalog as it is built.
   */
  init() {
    activateLocale(this.locale);

    config.onDidChange("app.language", () => {
      activateLocale(this.locale);

      appMenu.refresh();

      appTray.createOrUpdateContextMenu();

      // Every renderer page holds its own Lingui instance, seeded from the
      // locale `loadRenderer` puts in its search parameters, so a change
      // reaches the pages that are already open from here.
      for (const rendererWebContents of getRendererWebContents()) {
        ipc.renderer.send(rendererWebContents, "i18n.localeChanged", this.locale);
      }
    });
  }
}

export const appI18n = new AppI18n();
