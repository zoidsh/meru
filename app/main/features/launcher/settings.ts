import { z } from "zod";

import { appIdSchema } from "../../../core/records/app.ts";
import { appIds, appNames } from "../../../shared/apps.ts";
import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const launcherSettings = [
  defineSetting("launcher.apps", {
    default: appIds,
    description: msg`The apps the launcher lists, in the order it lists them.`,
    label: msg`Launcher apps`,
    page: "sidebar",
    restart: false,
    options: appNames,
    schema: z.array(appIdSchema),
    scope: "global",
    tier: "free",
  }),
] as const;
