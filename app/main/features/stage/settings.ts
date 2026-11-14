import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import {
  defineSetting,
  defineSettingsPage,
} from "../../../shared/settings/define.ts";

// Chromium's own zoom range.
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;

export const panesPage = defineSettingsPage("panes", {
  icon: "columns-2",
  label: msg`Panes`,
  order: 30,
});

export const stageSettings = [
  defineSetting("stage.zoom", {
    default: 1,
    label: msg`Zoom`,
    page: panesPage.id,
    restart: false,
    schema: z.number().min(MIN_ZOOM).max(MAX_ZOOM),
    scope: "profile",
    tier: "free",
  }),
] as const;
