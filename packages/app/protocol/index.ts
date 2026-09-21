import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { app, dialog } from "electron";
import { accounts } from "@/accounts";
import { showProUpgradeDialog } from "@/dialogs";
import {
  isMeruUrl,
  isWebUrl,
  MERU_PROTOCOL,
  type MeruDeepLink,
  parseMeruUrl,
  resolveRoutableUrl,
  upgradeToHttps,
} from "@/lib/deep-link";
import { licenseKey } from "@/license-key";
import { main } from "@/main";
import { isWindowsDefaultMailClient } from "./windows-mail-client";

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
 * Under `electron .` the executable is Electron itself, so the handler has to
 * carry the app entry as an argument to be launched back into this app.
 */
function setAsDefaultProtocolClient(protocol: string) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      if (!process.argv[1]) {
        throw new Error('Could not find "process.argv[1]"');
      }

      app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }
}

export async function getIsDefaultMailtoClient() {
  return platform.isWindows
    ? isWindowsDefaultMailClient()
    : app.isDefaultProtocolClient(MAILTO_PROTOCOL);
}

export function setAsDefaultMailtoClient() {
  setAsDefaultProtocolClient(MAILTO_PROTOCOL);
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

export function findWebUrlArg(argv: string[]) {
  return argv.find(isWebUrl);
}

export const PROCESS_WEB_URL_ARG = !platform.isMacOS ? findWebUrlArg(process.argv) : undefined;

export function setMeruProtocolClient() {
  setAsDefaultProtocolClient(MERU_PROTOCOL);
}

/**
 * Which account a deep link acts on. An address names one and never prompts, so
 * a link that resolves to no signed-in account opens nothing rather than
 * falling back to a dialog the address already answered.
 */
async function resolveDeepLinkAccount(email: string | undefined) {
  if (!email) {
    return promptForAccount("Which account should open this link?");
  }

  for (const [accountId, account] of accounts.instances) {
    if (account.gmail.userEmail === email) {
      return accountId;
    }
  }

  return undefined;
}

async function openMessageDeepLink({
  email,
  messageId,
}: Extract<MeruDeepLink, { type: "message" }>) {
  const accountId = await resolveDeepLinkAccount(email);

  if (!accountId) {
    return;
  }

  accounts.selectAccount(accountId);

  accounts.getAccount(accountId).instance.gmail.openMessage(messageId);
}

async function openUrlDeepLink(deepLink: Extract<MeruDeepLink, { type: "open" }>) {
  // Resolved before the account is asked for, so a URL the app refuses never
  // costs the user a dialog. A refused URL is dropped rather than handed to
  // `openExternalUrl`: the caller is a link router that already chose to send
  // it here, and giving it back to the operating system is how a loop starts.
  const url = resolveRoutableUrl(deepLink.url);

  if (!url) {
    return;
  }

  const accountId = await resolveDeepLinkAccount(deepLink.email);

  if (!accountId) {
    return;
  }

  const account = accounts.getAccount(accountId);

  if (!account.instance.tabs.openInAppLinksTab(url)) {
    account.instance.tabs.openUrl(url);
  }

  if (account.config.selected) {
    accounts.refreshSelectedAccountView();
  } else {
    accounts.selectAccount(accountId);
  }
}

export async function handleMeruUrl(url: string) {
  if (!licenseKey.isValid) {
    showProUpgradeDialog("Meru Pro is required to open Meru links.");

    return;
  }

  const deepLink = parseMeruUrl(url);

  if (!deepLink) {
    return;
  }

  if (deepLink.type === "message") {
    await openMessageDeepLink(deepLink);
  } else {
    await openUrlDeepLink(deepLink);
  }
}

/**
 * A web URL the desktop handed over because Meru holds the http or https
 * association, which is what puts Meru in a browser picker.
 *
 * The URL is not decoded on the way in: it arrives from the operating system
 * already decoded, unlike the `url` parameter of `meru://open`. A picker rule
 * scoped wider than Meru can serve opens nothing, `resolveRoutableUrl` refusing
 * every host but Google's.
 */
export async function handleWebUrl(url: string) {
  if (!licenseKey.isValid) {
    showProUpgradeDialog("Meru Pro is required to open links sent to Meru.");

    return;
  }

  await openUrlDeepLink({ type: "open", url: upgradeToHttps(url), email: undefined });
}
