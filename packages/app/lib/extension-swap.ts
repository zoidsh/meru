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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
        `Couldn't install the extension: ${getErrorMessage(error)}`,
        ...conflictNames.map((name) => `${name} is still on.`),
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

      throw new ExtensionInstallError(
        [
          `Couldn't turn off ${conflictName}: ${getErrorMessage(error)}`,
          isStillOn
            ? `${conflictName} is still on, and ${getName(extensionId)} wasn't installed.`
            : `${conflictName} is off, but some of its files may be left in Meru. ${getName(extensionId)} wasn't installed. Turn it on to try again.`,
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
        `Couldn't install the extension: ${getErrorMessage(error)}`,
        ...conflictingExtensionIds.map(
          (conflictingExtensionId) =>
            `${getName(conflictingExtensionId)} was turned off, and you're signed out of it in Meru.`,
        ),
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
