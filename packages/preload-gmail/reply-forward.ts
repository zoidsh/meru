import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import {
  createElementAttributeFromPreloadArgument,
  createNotMatchingAttributeSelector,
  reEmitClickWithShiftKey,
} from "./lib/utils";
import { $, $$ } from "select-dom";

const isReplyForwardInPopOutEnabled = process.argv.includes(
  GMAIL_PRELOAD_ARGUMENTS.replyForwardInPopOut,
);

const replyForwardElementAttribute = createElementAttributeFromPreloadArgument(
  GMAIL_PRELOAD_ARGUMENTS.replyForwardInPopOut,
);

const replyForwardElementSelector = createNotMatchingAttributeSelector(
  ".amn:has(> span[role='link']:nth-child(2))",
  replyForwardElementAttribute,
);

export function replyForwardInPopOut() {
  if (!isReplyForwardInPopOutEnabled) {
    return;
  }

  const replyForwardElement = $(replyForwardElementSelector);

  if (!replyForwardElement) {
    return;
  }

  replyForwardElement.setAttribute(replyForwardElementAttribute, "");

  const replyForwardButtons = $$("span[role='link']", replyForwardElement);

  if (replyForwardButtons.length !== 2) {
    console.warn("Unexpected number of buttons in reply/forward element", {
      replyForwardButtons,
    });

    return;
  }

  for (const replyForwardButton of replyForwardButtons) {
    reEmitClickWithShiftKey(replyForwardButton);
  }
}
