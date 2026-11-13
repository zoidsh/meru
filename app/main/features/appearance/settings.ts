import { styleSchema } from "../../../core/records/style.ts";
import { msg } from "../../../shared/msg.ts";
import {
  defineSetting,
  defineSettingsPage,
} from "../../../shared/settings/define.ts";

export const appearancePage = defineSettingsPage("appearance", {
  label: msg`Appearance`,
  order: 20,
});

export const appearanceSettings = [
  defineSetting("appearance.style", {
    default: "modern",
    description: msg`Modern insets panes with rounded corners; classic draws them edge to edge.`,
    label: msg`Appearance style`,
    options: { classic: msg`Classic`, modern: msg`Modern` },
    page: appearancePage.id,
    restart: false,
    schema: styleSchema,
    scope: "global",
    tier: "free",
  }),
] as const;
