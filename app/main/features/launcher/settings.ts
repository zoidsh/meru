import { z } from "zod";

import { idSchema } from "../../../core/records/id.ts";
import { apps } from "../../../shared/apps.ts";
import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const launcherSettings = [
  defineSetting("launcher.apps", {
    default: apps.map((app) => app.id),
    description: msg`The apps the launcher lists, in the order it lists them.`,
    label: msg`Launcher apps`,
    page: "sidebar",
    restart: false,
    schema: z.array(idSchema),
    scope: "global",
    tier: "free",
  }),
] as const;
