import { shell } from "electron";

export interface SystemBrowser {
  open: (url: string) => Promise<void>;
}

export const createSystemBrowser = (): SystemBrowser => ({
  open: (url) => shell.openExternal(url),
});
