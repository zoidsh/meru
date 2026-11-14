import type { StyleRule } from "../../content/styles.ts";
import { cssFeature } from "../feature.ts";

// Reversing the column moves Gmail's own separator to the wrong side of the messages, so the first and last rows take theirs back by hand; `.Bk .G2` is the message's header, which has no marker of its own.
const SEPARATOR = "rgba(100, 121, 143, 0.12)";

const MESSAGE = 'div[role="list"] div[role="listitem"]';

export const reverseConversationRules: readonly StyleRule[] = [
  {
    declarations: "display: flex; flex-direction: column-reverse;",
    selector: 'div[role="list"]:has(div[role="listitem"])',
  },
  {
    declarations: `border-top: 1px solid ${SEPARATOR} !important;`,
    selector: `${MESSAGE}:nth-last-of-type(2) .Bk .G2`,
  },
  {
    declarations: "border-top: none !important;",
    selector: `${MESSAGE}:last-of-type .Bk .G2`,
  },
  {
    declarations: `border-bottom: 1px solid ${SEPARATOR} !important;`,
    selector: `${MESSAGE}:nth-of-type(2):not(:last-of-type) .Bk .G2`,
  },
];

export const reverseConversation = cssFeature({
  entry: {
    anchor: `${MESSAGE} .Bk .G2`,
    context: `${MESSAGE}:nth-of-type(2)`,
    id: "reverseConversation",
  },
  id: "reverseConversation",
  rules: reverseConversationRules,
});
