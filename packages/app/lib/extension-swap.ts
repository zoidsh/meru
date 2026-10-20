import { t } from "@lingui/core/macro";
import {
  getConflictingExtensionIds,
  getCuratedExtension,
  getSkippedPasswordManagerIds,
} from "@meru/shared/extensions";
import { serializeError } from "serialize-error";

/** A failed install, with a message written for the settings page. */
export class ExtensionInstallError extends Error {}

export type ExtensionInstallSteps = {
  download: () => Promise<unknown>;
  getInstalledExtensionIds: () => string[];
  uninstall: (extensionId: string) => Promise<void>;
  recordOptIn: () => void;
};

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function getCouldNotInstallExtensionMessage(error: unknown) {
  const errorMessage = getErrorMessage(error);

  return t({
    message: `Couldn't install the extension: ${errorMessage}`,
    comment: "errorMessage is the technical reason, left untranslated",
  });
}

function getName(extensionId: string) {
  return getCuratedExtension(extensionId)?.name ?? extensionId;
}

/**
 * Installs an extension, turning off whichever installed one it can't run
 * beside.
 *
 * The download comes first, because it is the step most likely to fail and the
 * only one that needs the network: failing there changes nothing the user can
 * see. The other is uninstalled next, and the opt-in that loads the new one is
 * recorded last, so no config ever lists both. Nothing is reinstalled after a
 * failed uninstall or opt-in, since the uninstall has already cleared the
 * extension's data and a reinstall would be a different extension from the one
 * the user had.
 */
export async function installExtensionReplacingConflicts(
  extensionId: string,
  steps: ExtensionInstallSteps,
) {
  try {
    await steps.download();
  } catch (error) {
    const conflictNames = getConflictingExtensionIds(
      extensionId,
      steps.getInstalledExtensionIds(),
    ).map(getName);

    throw new ExtensionInstallError(
      [
        getCouldNotInstallExtensionMessage(error),
        ...conflictNames.map((name) =>
          t({
            message: `${name} is still on.`,
            comment: "name is the name of a browser extension, such as Bitwarden",
          }),
        ),
      ].join("\n\n"),
      { cause: error },
    );
  }

  // Read after the download, which can take long enough for the config to change
  const conflictingExtensionIds = getConflictingExtensionIds(
    extensionId,
    steps.getInstalledExtensionIds(),
  );

  for (const conflictingExtensionId of conflictingExtensionIds) {
    const conflictName = getName(conflictingExtensionId);

    try {
      await steps.uninstall(conflictingExtensionId);
    } catch (error) {
      const isStillOn = steps.getInstalledExtensionIds().includes(conflictingExtensionId);

      const errorMessage = getErrorMessage(error);

      const extensionName = getName(extensionId);

      throw new ExtensionInstallError(
        [
          t({
            message: `Couldn't turn off ${conflictName}: ${errorMessage}`,
            comment:
              "conflictName is an extension's name; errorMessage is the technical reason, left untranslated",
          }),
          isStillOn
            ? t`${conflictName} is still on, and ${extensionName} wasn't installed.`
            : t`${conflictName} is off, but some of its files may be left in Meru. ${extensionName} wasn't installed. Turn it on to try again.`,
        ].join("\n\n"),
        { cause: error },
      );
    }
  }

  try {
    steps.recordOptIn();
  } catch (error) {
    throw new ExtensionInstallError(
      [
        getCouldNotInstallExtensionMessage(error),
        ...conflictingExtensionIds.map((conflictingExtensionId) => {
          const conflictName = getName(conflictingExtensionId);

          return t`${conflictName} was turned off, and you're signed out of it in Meru.`;
        }),
      ].join("\n\n"),
      { cause: error },
    );
  }
}

export type PasswordManagerNormalizationSteps = {
  getInstalledExtensionIds: () => string[];
  uninstall: (extensionId: string) => Promise<void>;
  log: {
    info: (message: string, details: Record<string, unknown>) => void;
    error: (message: string, details: Record<string, unknown>) => void;
  };
};

/**
 * Uninstalls every password manager but the one installed last, which a
 * version of Meru without the one-at-a-time rule can leave listed beside
 * another. A failure is logged and the rest go on, since the loader skips the
 * same ones anyway.
 */
export async function normalizeInstalledPasswordManagers(steps: PasswordManagerNormalizationSteps) {
  const installedExtensionIds = steps.getInstalledExtensionIds();

  const replacedExtensionIds = getSkippedPasswordManagerIds(installedExtensionIds);

  const keptExtensionId = installedExtensionIds
    .filter((extensionId) => getCuratedExtension(extensionId)?.category === "passwordManager")
    .at(-1);

  for (const replacedExtensionId of replacedExtensionIds) {
    try {
      await steps.uninstall(replacedExtensionId);

      steps.log.info("Uninstalled a password manager replaced by a later install", {
        extensionId: replacedExtensionId,
        keptExtensionId,
      });
    } catch (error) {
      steps.log.error("Failed to uninstall a password manager replaced by a later install", {
        extensionId: replacedExtensionId,
        keptExtensionId,
        error: serializeError(error),
      });
    }
  }
}
