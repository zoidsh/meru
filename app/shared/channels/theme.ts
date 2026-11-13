import { z } from "zod";

import type { Theme } from "../../core/engines/chrome.ts";
import { definePushes, push } from "./define.ts";

export const themeSchema = z.enum(["light", "dark"]) satisfies z.ZodType<Theme>;

export const themePushes = definePushes("theme", {
  /** The theme main paints the window in changed, with the operating system's appearance or the app's own choice of it. */
  changed: push(z.object({ theme: themeSchema })),
});
