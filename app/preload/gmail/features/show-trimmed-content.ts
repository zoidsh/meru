import type { StyleRule } from "../../content/styles.ts";
import { cssFeature } from "../feature.ts";

// Gmail hides the quoted part of a message through `.adL` and `.h5` inside `.adO`, and `.ajU`/`.ajV` are the ••• that unfolds it, which has nothing to unfold once the quote shows.
export const showTrimmedContentRules: readonly StyleRule[] = [
  { declarations: "display: block !important;", selector: ".adO .adL" },
  { declarations: "display: block !important;", selector: ".adO .h5" },
  { declarations: "display: none !important;", selector: ".adO .ajU" },
  { declarations: "display: none !important;", selector: ".adO .ajV" },
];

export const showTrimmedContent = cssFeature({
  entry: {
    anchor: ".adO .ajU, .adO .ajV",
    context: ".adO",
    id: "showTrimmedContent",
  },
  id: "showTrimmedContent",
  rules: showTrimmedContentRules,
});
