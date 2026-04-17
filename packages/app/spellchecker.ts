import { platform } from "@electron-toolkit/utils";
import { app } from "electron";
import { config } from "./config";

class Spellchecker {
  init() {
    if (platform.isMacOS) {
      return;
    }

    const osLocale = app.getLocale();
    const savedLanguages = config.get("spellchecker.languages");

    if (savedLanguages.includes(osLocale)) {
      config.set(
        "spellchecker.languages",
        savedLanguages.filter((l) => l !== osLocale),
      );
    }
  }
}

export const spellchecker = new Spellchecker();
