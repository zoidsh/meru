import { platform } from "@electron-toolkit/utils";
import { app } from "electron";
import { getRelaunchOptions } from "./relaunch-options";

export function relaunchApp() {
  app.relaunch(getRelaunchOptions(platform, process.env, process.argv));
}
