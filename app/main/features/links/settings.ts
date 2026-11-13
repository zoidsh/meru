import { z } from "zod";

import { idSchema } from "../../../core/records/id.ts";
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
    schema: z.array(idSchema),
    scope: "global",
    tier: "pro",
  }),
  defineSetting("links.mode", {
    default: "tabs",
    description: msg`Whether a Google app a link opens becomes a tab or a window of its own.`,
    label: msg`Open apps as`,
    page: "panes",
    restart: false,
    schema: z.enum(["tabs", "windows"]),
    scope: "global",
    tier: "pro",
  }),
] as const;
