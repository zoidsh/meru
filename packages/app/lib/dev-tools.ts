import { is } from "@electron-toolkit/utils";
import { app } from "electron";

export const shouldOpenDevToolsOnLaunch = is.dev && app.commandLine.hasSwitch("devtools");
