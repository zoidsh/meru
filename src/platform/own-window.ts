import { BaseWindow } from "electron";

import { baseWindowOptions, plainWindow } from "./base-window.ts";
import type { BaseWindowOptions, PlainWindow } from "./base-window.ts";

/**
 * A tab's own window: no page of its own, only the views put in it, the
 * tab's page and the shell's titlebar document behind it.
 */
export type OwnWindow = PlainWindow;

export interface OwnWindowFactory {
  create: (options: BaseWindowOptions) => OwnWindow;
}

export const createOwnWindowFactory = (): OwnWindowFactory => ({
  create: (options) => plainWindow(new BaseWindow(baseWindowOptions(options))),
});
