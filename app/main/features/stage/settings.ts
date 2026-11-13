import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

// Chromium's own zoom range.
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 5;

export const stageSettings = [
  defineSetting("stage.zoom", {
    default: 1,
    label: msg`Zoom`,
    page: "panes",
    restart: false,
    schema: z.number().min(MIN_ZOOM).max(MAX_ZOOM),
    scope: "profile",
    tier: "free",
  }),
] as const;
