import { randomUUID } from "node:crypto";
import { is, platform } from "@electron-toolkit/utils";
import { createDefaultConfig } from "@meru/shared/config";
import type { Config } from "@meru/shared/types";
import { app } from "electron";
import { CachedStore } from "./lib/cached-store";
import { createConfigOptions } from "./lib/config-migrations";

export const config = new CachedStore<Config>({
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
