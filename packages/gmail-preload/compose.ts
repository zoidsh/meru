import { GMAIL_PRELOAD_ARGUMENTS } from "@meru/shared/gmail";
import { $ } from "select-dom";
import {
  createElementNotProcessedSelector,
  createElementProcessedAttributeFromPreloadArgument,
} from "./lib/utils";

const isOpenComposeInNewWindowEnabled = process.argv.includes(
  GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow,
);

const composeButtonProcessedAttribute = createElementProcessedAttributeFromPreloadArgument(
  GMAIL_PRELOAD_ARGUMENTS.openComposeInNewWindow,
);

const composeButtonElementSelector = createElementNotProcessedSelector(
  ".T-I.T-I-KE.L3",
  composeButtonProcessedAttribute,
);

export async function openComposeInNewWindow() {
  if (!isOpenComposeInNewWindowEnabled) {
    return;
  }

  const composeButtonElement = $(composeButtonElementSelector);

  if (!composeButtonElement) {
    return;
  }

  composeButtonElement.setAttribute(composeButtonProcessedAttribute, "");

  let isClicked = false;

  composeButtonElement.addEventListener("click", (event) => {
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

    composeButtonElement.dispatchEvent(clickEvent);
  });
}
