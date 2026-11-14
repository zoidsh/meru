import { pointSchema } from "../../core/records/rect.ts";
import { definePushes, push } from "./define.ts";

export const dragPushes = definePushes("drag", {
  /** Where the pointer is over the window, as the chrome page saw it, for a drag overlay that does not get the pointer itself while the chrome page holds it. */
  pointer: push(pointSchema),
});
