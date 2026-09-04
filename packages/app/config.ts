import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import { createDefaultConfig } from "@meru/shared/config";
import type { Config } from "@meru/shared/types";
import { app } from "electron";
import Store from "electron-store";
import { createConfigOptions } from "./lib/config-migrations";

export const config = new Store<Config>({
  name: is.dev ? "config.dev" : "config",
  ...createConfigOptions({
    version: app.getVersion(),
    defaults: createDefaultConfig({
      accountId: randomUUID(),
      downloadsLocation: app.getPath("downloads"),
      trayEnabled: !platform.isMacOS,
    }),
  }),
});
