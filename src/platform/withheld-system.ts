import { dialog, shell } from "electron";

import { WITHHELD_MARKER } from "#core/withheld.ts";

/**
 * For the end-to-end build, from launch: Electron's own calls that open
 * something outside the app or put a native dialog on the desktop answer as
 * a cancel and record what was asked under `meruTestWithheld`, said on
 * main's log under `WITHHELD_MARKER`, which fails the test that hit it. Each surface a feature uses has a captured adapter of its
 * own; this catches the call that has none, so a test that forgets to stub
 * one never opens the system's mail app, a browser or a dialog. A test may
 * still put its own answer in place, as the removal confirmation's does.
 */
export const withholdSystemSurfaces = () => {
  const withheld: string[] = [];

  Reflect.set(globalThis, "meruTestWithheld", withheld);

  const withhold = (call: string) => {
    withheld.push(call);
    console.error(`${WITHHELD_MARKER} ${call}`);
  };

  shell.openExternal = () => {
    withhold("shell.openExternal");

    return Promise.resolve();
  };
  shell.openPath = () => {
    withhold("shell.openPath");

    return Promise.resolve("");
  };
  shell.showItemInFolder = () => {
    withhold("shell.showItemInFolder");
  };
  dialog.showMessageBox = ((...args: unknown[]) => {
    withhold("dialog.showMessageBox");

    const options = args.at(-1) as { cancelId?: number };

    return Promise.resolve({
      response: options.cancelId ?? 0,
      checkboxChecked: false,
    });
  }) as typeof dialog.showMessageBox;
  dialog.showMessageBoxSync = ((...args: unknown[]) => {
    withhold("dialog.showMessageBoxSync");

    return (args.at(-1) as { cancelId?: number }).cancelId ?? 0;
  }) as typeof dialog.showMessageBoxSync;
  dialog.showErrorBox = () => {
    withhold("dialog.showErrorBox");
  };
  dialog.showOpenDialog = (() => {
    withhold("dialog.showOpenDialog");

    return Promise.resolve({ canceled: true, filePaths: [] });
  }) as typeof dialog.showOpenDialog;
  dialog.showSaveDialog = (() => {
    withhold("dialog.showSaveDialog");

    return Promise.resolve({ canceled: true, filePath: "" });
  }) as typeof dialog.showSaveDialog;
};
