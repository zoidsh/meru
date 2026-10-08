import { describe, expect, test } from "bun:test";
import { BITWARDEN_EXTENSION_ID, ONEPASSWORD_EXTENSION_ID } from "@meru/shared/extensions";
import { ExtensionInstallError, installExtensionReplacingConflicts } from "./extension-swap";

function createSteps(
  installedExtensionIds: string[],
  failures: {
    download?: boolean;
    uninstall?: "beforeOptOut" | "afterOptOut";
    optIn?: boolean;
  } = {},
) {
  let installed = [...installedExtensionIds];

  const calls: string[] = [];

  return {
    calls,
    getInstalled: () => installed,
    steps: {
      download: async () => {
        calls.push("download");

        if (failures.download) {
          throw new Error("Network unreachable");
        }
      },
      getInstalledExtensionIds: () => installed,
      uninstall: async (extensionId: string) => {
        calls.push(`uninstall ${extensionId}`);

        if (failures.uninstall === "beforeOptOut") {
          throw new Error("Disk full");
        }

        installed = installed.filter(
          (installedExtensionId) => installedExtensionId !== extensionId,
        );

        if (failures.uninstall === "afterOptOut") {
          throw new Error("Files in use");
        }
      },
      recordOptIn: () => {
        calls.push("recordOptIn");

        if (failures.optIn) {
          throw new Error("Config is read-only");
        }

        installed = [...installed, ONEPASSWORD_EXTENSION_ID];
      },
    },
  };
}

async function getInstallError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );

  expect(error).toBeInstanceOf(ExtensionInstallError);

  return (error as ExtensionInstallError).message;
}

describe("installExtensionReplacingConflicts", () => {
  test("installs with nothing to turn off", async () => {
    const { calls, getInstalled, steps } = createSteps([]);

    await installExtensionReplacingConflicts(ONEPASSWORD_EXTENSION_ID, steps);

    expect(calls).toEqual(["download", "recordOptIn"]);

    expect(getInstalled()).toEqual([ONEPASSWORD_EXTENSION_ID]);
  });

  test("downloads, then turns off the other password manager, then records the opt-in", async () => {
    const { calls, getInstalled, steps } = createSteps([BITWARDEN_EXTENSION_ID]);

    await installExtensionReplacingConflicts(ONEPASSWORD_EXTENSION_ID, steps);

    expect(calls).toEqual(["download", `uninstall ${BITWARDEN_EXTENSION_ID}`, "recordOptIn"]);

    expect(getInstalled()).toEqual([ONEPASSWORD_EXTENSION_ID]);
  });

  test("leaves the other password manager on when the download fails", async () => {
    const { calls, getInstalled, steps } = createSteps([BITWARDEN_EXTENSION_ID], {
      download: true,
    });

    expect(
      await getInstallError(installExtensionReplacingConflicts(ONEPASSWORD_EXTENSION_ID, steps)),
    ).toBe("Couldn't install the extension: Network unreachable\n\nBitwarden is still on.");

    expect(calls).toEqual(["download"]);

    expect(getInstalled()).toEqual([BITWARDEN_EXTENSION_ID]);
  });

  test("installs nothing when turning off the other fails before its opt-out", async () => {
    const { calls, getInstalled, steps } = createSteps([BITWARDEN_EXTENSION_ID], {
      uninstall: "beforeOptOut",
    });

    expect(
      await getInstallError(installExtensionReplacingConflicts(ONEPASSWORD_EXTENSION_ID, steps)),
    ).toBe(
      "Couldn't turn off Bitwarden: Disk full\n\nBitwarden is still on, and 1Password wasn't installed.",
    );

    expect(calls).not.toContain("recordOptIn");

    expect(getInstalled()).toEqual([BITWARDEN_EXTENSION_ID]);
  });

  test("says the other is off when its uninstall fails after its opt-out", async () => {
    const { calls, getInstalled, steps } = createSteps([BITWARDEN_EXTENSION_ID], {
      uninstall: "afterOptOut",
    });

    expect(
      await getInstallError(installExtensionReplacingConflicts(ONEPASSWORD_EXTENSION_ID, steps)),
    ).toBe(
      "Couldn't turn off Bitwarden: Files in use\n\nBitwarden is off, but some of its data may be left behind. 1Password wasn't installed. Turn it on to try again.",
    );

    expect(calls).not.toContain("recordOptIn");

    expect(getInstalled()).toEqual([]);
  });

  test("says the other was turned off when the opt-in fails after the uninstall", async () => {
    const { calls, getInstalled, steps } = createSteps([BITWARDEN_EXTENSION_ID], {
      optIn: true,
    });

    expect(
      await getInstallError(installExtensionReplacingConflicts(ONEPASSWORD_EXTENSION_ID, steps)),
    ).toBe(
      "Couldn't install the extension: Config is read-only\n\nBitwarden was turned off and its data removed.",
    );

    expect(calls).toEqual(["download", `uninstall ${BITWARDEN_EXTENSION_ID}`, "recordOptIn"]);

    expect(getInstalled()).toEqual([]);
  });

  test("reads what to turn off after the download, not before it", async () => {
    const { calls, steps } = createSteps([]);

    await installExtensionReplacingConflicts(ONEPASSWORD_EXTENSION_ID, {
      ...steps,
      getInstalledExtensionIds: () =>
        calls.includes("download") && !calls.includes(`uninstall ${BITWARDEN_EXTENSION_ID}`)
          ? [BITWARDEN_EXTENSION_ID]
          : [],
    });

    expect(calls).toEqual(["download", `uninstall ${BITWARDEN_EXTENSION_ID}`, "recordOptIn"]);
  });
});
