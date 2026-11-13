import { z } from "zod";

import { msg } from "../../../shared/msg.ts";
import { defineSetting } from "../../../shared/settings/define.ts";

export const windowsSettings = [
  defineSetting("window.linuxControls", {
    default: false,
    description: msg`Show the close, minimize and maximize buttons in the titlebar.`,
    label: msg`Window controls`,
    page: "appearance",
    section: msg`Window`,
    platforms: ["linux"],
    restart: true,
    schema: z.boolean(),
    scope: "global",
    tier: "free",
  }),
] as const;
