import { createDevServerPolicy } from "#platform/dev-server.ts";
import type { createAppProtocol } from "#platform/protocol.ts";

import { createContentSecurityPolicy } from "../content-security-policy.ts";
import {
  createDevContentSecurityPolicy,
  readDevServer,
} from "../dev-server.ts";

export const APP_SCHEME = "meru-app";

const SHELL_HOST = "shell";

const SETTINGS_HOST = "settings";

/**
 * Where the shell's page and the Settings window's come from, Vite's dev
 * server or the app's own scheme, and what makes them servable once the app
 * is ready.
 */
export const resolveShell = () => {
  if (MERU_BUILD_MODE === "dev") {
    const devServer = readDevServer(process.env);

    return {
      url: new URL("shell/index.html", devServer.url).href,
      settingsUrl: new URL("settings/index.html", devServer.url).href,
      apply: () => {
        createDevServerPolicy().apply({
          origin: new URL(devServer.url).origin,
          contentSecurityPolicy: createDevContentSecurityPolicy(devServer),
        });
      },
    };
  }

  return {
    url: `${APP_SCHEME}://${SHELL_HOST}/index.html`,
    settingsUrl: `${APP_SCHEME}://${SETTINGS_HOST}/index.html`,
    apply: (appProtocol: ReturnType<typeof createAppProtocol>) => {
      appProtocol.serve({
        scheme: APP_SCHEME,
        root: import.meta.dirname,
        hosts: [SHELL_HOST, SETTINGS_HOST],
        contentSecurityPolicy: createContentSecurityPolicy(),
      });
    },
  };
};
