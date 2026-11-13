import { z } from "zod";

import { themeSchema } from "../../core/records/theme.ts";
import { definePushes, push } from "./define.ts";

export const themePushes = definePushes("theme", {
  /** The theme main paints the window in changed, with the operating system's appearance or the app's own choice of it. */
  changed: push(z.object({ theme: themeSchema })),
});
