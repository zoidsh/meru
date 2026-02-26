import path from "node:path";
import { platform } from "@electron-toolkit/utils";
import { app, dialog } from "electron";
import { accounts } from "./accounts";
import { ipc } from "./ipc";
import { licenseKey } from "./license-key";
import { main } from "./main";

export const MAILTO_PROTOCOL = "mailto";

export function findMailtoUrlArg(argv: string[]) {
  return argv.find((arg) => arg.startsWith(`${MAILTO_PROTOCOL}://`));
}

export const PROCESS_MAILTO_URL_ARG = !platform.isMacOS
  ? findMailtoUrlArg(process.argv)
  : undefined;

export function isMailtoUrl(url: string) {
  return url.startsWith(`${MAILTO_PROTOCOL}://`);
}

export async function handleMailtoUrl(url: string) {
  if (!licenseKey.isValid) {
    dialog.showMessageBox(main.window, {
      type: "warning",
      message: "Meru Pro is required to use Meru as default mail client",
    });

    return;
  }

  if (!isMailtoUrl(url)) {
    return;
  }

  const accountConfigs = accounts.getAccountConfigs();

  let accountId = accountConfigs[0]?.id;

  if (accountConfigs.length > 1) {
    const cancelId = accountConfigs.length + 1;

    const { response } = await dialog.showMessageBox(main.window, {
      type: "question",
      message: "Compose new email",
      detail: "Which account would you like to use?",
      buttons: [...accountConfigs.map((account) => account.label), "Cancel"],
      cancelId,
    });

    if (response === cancelId) {
      return;
    }

    const accountConfig = accountConfigs[response];

    if (!accountConfig) {
      throw new Error("Could not find account config");
    }

    accountId = accountConfig.id;
  }

  if (!accountId) {
    throw new Error("Could not determine account id");
  }

  accounts.getAccount(accountId).instance.gmail.createComposeWindow(url);
}

export const MERU_PROTOCOL = "meru";

export function findMeruUrlArg(argv: string[]) {
  return argv.find((arg) => arg.startsWith(`${MERU_PROTOCOL}://`));
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

export function isMeruUrl(url: string) {
  return url.startsWith(`${MERU_PROTOCOL}://`);
}

export function handleMeruUrl(url: string) {
  if (!isMeruUrl(url)) {
    return;
  }

  const paths = url.replace(`${MERU_PROTOCOL}://`, "").split("/");

  if (paths[0]?.includes("@")) {
    const email = paths[0];

    if (paths[1] === "message" && paths[2]) {
      for (const [_accountId, account] of accounts.instances) {
        if (account.gmail.userEmail === email) {
          ipc.renderer.send(account.gmail.view.webContents, "gmail.openMessage", paths[2]);

          return;
        }
      }
    }
  }
}
