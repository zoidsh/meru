import { z } from "zod";

import { appIdSchema } from "../../../core/records/app.ts";
import { appNames } from "../../../shared/apps.ts";
import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const linksSettings = [
  defineSetting("links.openInApp", {
    default: true,
    description: msg`Open links to Google apps in Meru rather than in the browser.`,
    label: msg`Open Google apps in Meru`,
    page: "panes",
    restart: false,
    schema: z.boolean(),
    scope: "global",
    tier: "pro",
  }),
  defineSetting("links.excludedApps", {
    default: [],
    description: msg`Apps whose links always open in the browser.`,
    label: msg`Apps to open in the browser`,
    page: "panes",
    restart: false,
    options: appNames,
    schema: z.array(appIdSchema),
    scope: "global",
    tier: "pro",
  }),
] as const;
