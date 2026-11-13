import { z } from "zod";

import { defineChannels, invoke } from "./define.ts";

/** Answered only under MERU_MEASURE=1, for `pnpm measure` and the budget test. */
export const measure = defineChannels("measure", {
  /** What each web contents shows, by its id: the chrome page, a pane by its tab's host, an overlay. */
  roles: invoke(
    z.object({}),
    z.array(z.object({ contentsId: z.number().int(), name: z.string() }))
  ),
});
