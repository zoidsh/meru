import path from "node:path";

import type { SettingsState } from "#contract/settings.ts";
import { downloadsFolder, shownFolder } from "#core/downloads-folder.ts";
import type { Platform } from "#core/platform.ts";
import { languageName } from "#i18n/index.ts";
import type { DownloadFiles } from "#platform/downloads.ts";
import type { LoginItem } from "#platform/login-item.ts";
import type { MailHandler } from "#platform/mail-handler.ts";

import type { Language } from "./language.ts";
import type { SettingsStore } from "./settings.ts";
import type { Spellcheck } from "./spellcheck.ts";

export interface GeneralPageDeps {
  platform: Platform;
  loginItem: LoginItem;
  mailHandler: MailHandler;
  settings: Pick<
    SettingsStore,
    "get" | "update" | "setOverride" | "overridingProfiles"
  >;
  /**
   * The system's Downloads folder, never made by a page that only shows it,
   * and whether a chosen one is there.
   */
  files: Pick<DownloadFiles, "systemFolder" | "usable">;
  /** The home folder, which macOS shows a folder under as `~`. */
  home: string;
  /** The system's folder picker on the Settings window, at `defaultPath`. */
  pickFolder: (defaultPath: string) => Promise<string | undefined>;
  language: Pick<Language, "system" | "available">;
  /** None on macOS, which checks spelling with its own. */
  spellcheck: Pick<Spellcheck, "read"> | undefined;
  log: (message: string) => void;
}

const describe = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * What the General page shows that is not a plain setting: the languages it
 * offers, the system's login item, which Linux has none of here, as in v3,
 * whether the system sends email links to Meru, which the system holds and
 * is asked again as the Settings window regains focus, and the folder
 * downloads are saved to, which only the system's picker sets.
 */
export const createGeneralPage = ({
  platform,
  loginItem,
  mailHandler,
  settings,
  files,
  home,
  pickFolder,
  language,
  spellcheck,
  log,
}: GeneralPageDeps) => {
  const listeners = new Set<() => void>();
  let mailDefault = false;

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  const readMailDefault = async () => {
    try {
      const next = await mailHandler.isDefault();

      if (next !== mailDefault) {
        mailDefault = next;
        notify();
      }
    } catch (error) {
      log(`Whether Meru opens email links was not read: ${describe(error)}`);
    }
  };

  /**
   * Where the profile's next download goes, or the app's with none: the
   * chosen folder while it is usable.
   */
  const saveFolder = (profileId: string | undefined) =>
    downloadsFolder(settings.get("downloadsFolder", profileId), {
      usable: files.usable,
      system: files.systemFolder,
    }).folder;

  const shown = (profileId?: string) => {
    const chosen = settings.get("downloadsFolder", profileId);

    return {
      path: shownFolder(chosen ?? files.systemFolder(), { home, platform }),
      available: chosen === null || files.usable(chosen),
    };
  };

  return {
    /** Of the listed profiles alone, as no other profile's value is sent. */
    read: (listed: readonly string[]): SettingsState["general"] => {
      const own = settings.overridingProfiles("downloadsFolder");

      return {
        openAtLogin:
          platform === "linux"
            ? null
            : { on: loginItem.isOn(), real: loginItem.real },
        downloadsFolder: shown(),
        profileDownloadsFolders: Object.fromEntries(
          listed
            .filter((profileId) => own.includes(profileId))
            .map((profileId) => [profileId, shown(profileId)])
        ),
        language: {
          system: languageName(language.system()),
          choices: language.available.map((tag) => ({
            language: tag,
            name: languageName(tag),
          })),
        },
        spelling: spellcheck?.read() ?? null,
        emailLinks: { isDefault: mailDefault, real: mailHandler.real },
      };
    },
    /** Asks the system again whether it sends email links to Meru. */
    readEmailLinks: readMailDefault,
    /**
     * Makes Meru the system's handler for email links, or gives them back,
     * on macOS and Linux; Linux has no way to give them back.
     */
    setEmailLinks: async (on: boolean) => {
      if (platform === "win32") {
        throw new Error("Windows lets no app make itself the mail handler");
      }

      if (!on && platform === "linux") {
        throw new Error("Linux gives email links back to no other app");
      }

      mailHandler.set(on);
      await readMailDefault();
    },
    /** Windows' Default apps, where Meru is chosen for email links. */
    openDefaultApps: async () => {
      if (platform !== "win32") {
        throw new Error(
          "Only Windows chooses the mail handler in its settings"
        );
      }

      await mailHandler.openSettings();
    },
    setOpenAtLogin: (on: boolean) => {
      if (platform === "linux") {
        throw new Error("Meru has no login item on Linux");
      }

      loginItem.set(on);
      notify();
    },
    /**
     * Opens the picker at where the profile's downloads go now, or the
     * app's with none, and stores the folder chosen as its own or the app's;
     * a cancel changes nothing.
     */
    chooseDownloadsFolder: async (profileId: string | undefined) => {
      const chosen = await pickFolder(saveFolder(profileId));

      if (chosen === undefined) {
        return;
      }

      if (!path.isAbsolute(chosen)) {
        throw new Error("The folder picker gave a relative path");
      }

      await (profileId === undefined
        ? settings.update("downloadsFolder", () => chosen)
        : settings.setOverride(profileId, "downloadsFolder", chosen));
    },
    /**
     * Applied to the list as stored when the store gets to it, so two quick
     * toggles both hold, which a list sent from the page would not.
     */
    setSpellcheckLanguage: async (code: string, on: boolean) => {
      if (!spellcheck) {
        throw new Error("Meru checks spelling with the system's own on macOS");
      }

      await settings.update("spellcheckLanguages", (languages) => {
        const others = languages.filter((each) => each !== code);

        return on ? [...others, code] : others;
      });
    },
    onChange: (listener: () => void) => {
      listeners.add(listener);
    },
  };
};

export type GeneralPage = ReturnType<typeof createGeneralPage>;
