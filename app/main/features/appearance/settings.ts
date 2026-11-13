import { styleSchema } from "../../../core/records/style.ts";
import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const appearanceSettings = [
  defineSetting("appearance.style", {
    default: "modern",
    description: msg`Modern insets panes with rounded corners; classic draws them edge to edge.`,
    label: msg`Appearance style`,
    page: "appearance",
    restart: false,
    schema: styleSchema,
    scope: "global",
    tier: "free",
  }),
] as const;
