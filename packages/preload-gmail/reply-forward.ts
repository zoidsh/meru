import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import {
  createElementAttributeFromPreloadArgument,
  createNotMatchingAttributeSelector,
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
    let isClicked = false;

    replyForwardButton.addEventListener("click", (event) => {
      if (isClicked) {
        isClicked = false;

        return;
      }

      isClicked = true;

      event.stopPropagation();

      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        shiftKey: true,
      });

      replyForwardButton.dispatchEvent(clickEvent);
    });
  }
}
