import { platform } from "@electron-toolkit/utils";
import { app } from "electron";
import { config } from "./config";

export function initSpellchecker() {
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
