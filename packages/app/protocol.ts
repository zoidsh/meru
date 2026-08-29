import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { app, dialog } from "electron";
import { accounts } from "./accounts";
import { showProUpgradeDialog } from "./dialogs";
import { ipc } from "./ipc";
import { isMeruUrl, MERU_PROTOCOL, type MeruDeepLink, parseMeruUrl } from "./lib/deep-link";
import { licenseKey } from "./license-key";
import { main } from "./main";

export const MAILTO_PROTOCOL = "mailto";

export function findMailtoUrlArg(argv: string[]) {
  return argv.find((arg) => arg.startsWith(`${MAILTO_PROTOCOL}:`));
}

export const PROCESS_MAILTO_URL_ARG = !platform.isMacOS
  ? findMailtoUrlArg(process.argv)
  : undefined;

export function isMailtoUrl(url: string) {
  return url.startsWith(`${MAILTO_PROTOCOL}:`);
}

/**
 * Which account a protocol handler should act on. Answered without asking when
 * there is only one account to answer with, and undefined when the user
 * cancels the dialog.
 */
async function promptForAccount(message: string) {
  const accountConfigs = accounts.getAccountConfigs();

  if (accountConfigs.length <= 1) {
    return accountConfigs[0]?.id;
  }

  const cancelId = accountConfigs.length;

  const { response } = await dialog.showMessageBox(main.window, {
    type: "question",
    message,
    buttons: [...accountConfigs.map((accountConfig) => accountConfig.label), "Cancel"],
    cancelId,
  });

  if (response === cancelId) {
    return undefined;
  }

  return accountConfigs[response]?.id;
}

export async function handleMailtoUrl(url: string) {
  if (!licenseKey.isValid) {
    showProUpgradeDialog("Meru Pro is required to set Meru as the default mail client.");

    return;
  }

  if (!isMailtoUrl(url)) {
    return;
  }

  const accountId = await promptForAccount("Which account should compose this email?");

  if (!accountId) {
    return;
  }

  accounts.getAccount(accountId).instance.gmail.createComposeWindow(url);
}

export function findMeruUrlArg(argv: string[]) {
  return argv.find(isMeruUrl);
}

export const PROCESS_MERU_URL_ARG = !platform.isMacOS ? findMeruUrlArg(process.argv) : undefined;

export function setMeruProtocolClient() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      if (!process.argv[1]) {
        throw new Error('Could not find "process.argv[1]"');
      }

      app.setAsDefaultProtocolClient(MERU_PROTOCOL, process.execPath, [
        path.resolve(process.argv[1]),
      ]);
    }
  } else {
    app.setAsDefaultProtocolClient(MERU_PROTOCOL);
  }
}

function openMessageDeepLink({ email, messageId }: Extract<MeruDeepLink, { type: "message" }>) {
  for (const [accountId, account] of accounts.instances) {
    if (account.gmail.userEmail === email) {
      accounts.selectAccount(accountId);

      ipc.renderer.send(account.gmail.view.webContents, "gmail.openMessage", messageId);

      return;
    }
  }
}

export function handleMeruUrl(url: string) {
  if (!licenseKey.isValid) {
    showProUpgradeDialog("Meru Pro is required to open Meru links.");

    return;
  }

  const deepLink = parseMeruUrl(url);

  if (!deepLink) {
    return;
  }

  if (deepLink.type === "message") {
    openMessageDeepLink(deepLink);
  }

  // The open route parses but is not carried out yet; it lands in the slice
  // that adds the routing behind it.
}
